import * as THREE from 'three';

export type Quality = 'low' | 'medium' | 'high';

export interface QualityProfile {
  pixelRatio: number;
  shadows: number;
  post: boolean;
  vegetationDensity: number;
}

export function qualityProfile(q: Quality): QualityProfile {
  const dpr = window.devicePixelRatio || 1;
  switch (q) {
    case 'high':
      return { pixelRatio: Math.min(dpr, 2), shadows: 2048, post: true, vegetationDensity: 1 };
    case 'medium':
      return { pixelRatio: Math.min(dpr, 1.5), shadows: 1024, post: true, vegetationDensity: 0.6 };
    case 'low':
      return { pixelRatio: 1, shadows: 0, post: false, vegetationDensity: 0.3 };
  }
}

/** Tablets and phones start on medium; desktops on high. */
export function autoQuality(): Quality {
  return matchMedia('(pointer: coarse)').matches ? 'medium' : 'high';
}

/**
 * Renders the scene into an offscreen target, then applies a comic "print"
 * pass: ink lines where depth jumps, warmer saturated colours and a vignette.
 */
export class ComicRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget | null = null;
  private post: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private postScene = new THREE.Scene();
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(
    canvas: HTMLCanvasElement,
    readonly profile: QualityProfile,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !profile.post,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(profile.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (profile.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    if (profile.post) {
      this.target = new THREE.WebGLRenderTarget(1, 1, {
        samples: 4,
        type: THREE.HalfFloatType,
        depthTexture: new THREE.DepthTexture(1, 1),
      });
      this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), comicMaterial());
      this.post.frustumCulled = false;
      this.postScene.add(this.post);
    }
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    if (this.target && this.post) {
      const pr = this.renderer.getPixelRatio();
      this.target.setSize(Math.floor(w * pr), Math.floor(h * pr));
      this.post.material.uniforms.resolution!.value.set(w * pr, h * pr);
    }
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    if (!this.target || !this.post) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    const u = this.post.material.uniforms;
    u.tColor!.value = this.target.texture;
    u.tDepth!.value = this.target.depthTexture;
    u.cameraNear!.value = camera.near;
    u.cameraFar!.value = camera.far;
    this.renderer.render(this.postScene, this.postCamera);
  }
}

function comicMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      cameraNear: { value: 0.1 },
      cameraFar: { value: 2500 },
      resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform float cameraNear;
      uniform float cameraFar;
      uniform vec2 resolution;
      varying vec2 vUv;

      float viewZ(vec2 uv) {
        float d = texture2D(tDepth, uv).x;
        return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
      }

      void main() {
        vec3 col = texture2D(tColor, vUv).rgb;
        vec2 px = 1.0 / resolution;
        float c = viewZ(vUv);
        float l = viewZ(vUv - vec2(px.x, 0.0));
        float r = viewZ(vUv + vec2(px.x, 0.0));
        float u = viewZ(vUv + vec2(0.0, px.y));
        float d = viewZ(vUv - vec2(0.0, px.y));
        // Laplacian of depth, relative to distance: catches silhouettes, ignores smooth slopes.
        float lap = abs(l + r + u + d - 4.0 * c) / max(c, 0.001);
        float edge = smoothstep(0.06, 0.16, lap);
        // Keep lines crisp nearby and let them fade into the haze.
        edge *= 1.0 - smoothstep(120.0, 700.0, c);
        col = mix(col, vec3(0.09, 0.06, 0.05), edge * 0.85);

        // Comic grading: a touch more saturation and warmth.
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(luma), col, 1.12);
        col *= vec3(1.03, 1.0, 0.95);

        // Soft vignette.
        vec2 q = vUv - 0.5;
        col *= 1.0 - dot(q, q) * 0.45;

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
