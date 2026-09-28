let container: HTMLElement | null = null;

export function toast(text: string, ms = 3500) {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toasts';
    document.body.append(container);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  container.append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}
