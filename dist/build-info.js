'use strict';

// Filled by the Pages workflow from dist/build.json. Locally this stays "local".
(() => {
  const link = document.getElementById('build-commit');
  if (!link) return;
  fetch('build.json', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((info) => {
      if (!info || typeof info !== 'object') return;
      const sha = typeof info.sha === 'string' ? info.sha : '';
      if (!/^[0-9a-f]{7,40}$/.test(sha)) return;
      link.textContent =
        typeof info.short === 'string' && info.short ? info.short : sha.slice(0, 7);
      link.href =
        typeof info.url === 'string' && info.url
          ? info.url
          : `https://github.com/ToniDonDoni/greydressnews/commit/${sha}`;
      link.title = sha;
    })
    .catch(() => {});
})();
