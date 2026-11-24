(() => {
  const api = window.opticaPicker;
  const grid = document.getElementById('grid');
  const emptyEl = document.getElementById('empty');
  const cancelBtn = document.getElementById('cancelBtn');
  const confirmBtn = document.getElementById('confirmBtn');
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));

  let allSources = [];
  let activeFilter = 'all';
  let selectedId = null;

  function render() {
    if (!grid || !emptyEl) return;
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }

    const filtered = allSources.filter((src) =>
      activeFilter === 'all' ? true : src.kind === activeFilter
    );

    if (filtered.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    for (const src of filtered) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = src.id === selectedId ? 'card selected' : 'card';

      const thumb = document.createElement('img');
      thumb.className = 'thumb';
      thumb.alt = '';
      if (typeof src.thumbnailDataUrl === 'string' && src.thumbnailDataUrl.startsWith('data:image/')) {
        thumb.src = src.thumbnailDataUrl;
      }
      card.appendChild(thumb);

      const meta = document.createElement('div');
      meta.className = 'meta';

      if (typeof src.appIconDataUrl === 'string' && src.appIconDataUrl.startsWith('data:image/')) {
        const icon = document.createElement('img');
        icon.className = 'app-icon';
        icon.alt = '';
        icon.src = src.appIconDataUrl;
        meta.appendChild(icon);
      }

      const label = document.createElement('span');
      label.className = 'name';
      label.textContent = src.name || 'Fuente sin título';
      meta.appendChild(label);

      card.appendChild(meta);

      card.addEventListener('click', () => {
        selectedId = src.id;
        if (confirmBtn) confirmBtn.disabled = false;
        render();
      });

      card.addEventListener('dblclick', () => {
        api.selectSource(src.id, false);
      });

      grid.appendChild(card);
    }
  }

  for (const btn of tabButtons) {
    btn.addEventListener('click', () => {
      activeFilter = btn.getAttribute('data-filter') || 'all';
      for (const other of tabButtons) {
        other.classList.toggle('active', other === btn);
      }
      render();
    });
  }

  cancelBtn?.addEventListener('click', () => api.cancel());
  confirmBtn?.addEventListener('click', () => {
    if (selectedId) api.selectSource(selectedId, false);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      api.cancel();
    } else if (e.key === 'Enter' && selectedId) {
      api.selectSource(selectedId, false);
    }
  });

  api
    .getSources()
    .then((sources) => {
      allSources = Array.isArray(sources) ? sources : [];
      if (allSources.length > 0) {
        selectedId = allSources[0].id;
        if (confirmBtn) confirmBtn.disabled = false;
      }
      render();
    })
    .catch(() => {
      allSources = [];
      render();
    });
})();
