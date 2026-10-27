/* Share buttons. Fills every element with a data-share attribute with links that post this page to
   social media, a "Copy link" button and, where the browser has one, the system share sheet.
   Brand icons are from Simple Icons (CC0, simpleicons.org); LinkedIn's was removed from that set,
   so its mark is drawn here. */
(function () {
  'use strict';
  const PAGE = 'https://ychenzgithub.github.io/ScalSeaLevel/';
  const TITLE = 'SoCal El Niño Sea Level Outlook';
  const TEXT = 'A near-record El Niño is building. How high will the sea stand on the Southern California coast? ' +
    'An interactive outlook built from tide-gauge records back to 1906.';
  const enc = encodeURIComponent;
  const withUrl = enc(TEXT + ' ' + PAGE);

  const ICON = {
    x: '<path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/>',
    bluesky: '<path d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026"/>',
    threads: '<path d="M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z"/>',
    facebook: '<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/>',
    linkedin: '<path fill-rule="evenodd" d="M2.5 0h19A2.5 2.5 0 0 1 24 2.5v19a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 0 21.5v-19A2.5 2.5 0 0 1 2.5 0ZM3.6 9.1v11.3h3.6V9.1H3.6Zm1.8-5.6a2.05 2.05 0 1 0 0 4.1 2.05 2.05 0 0 0 0-4.1Zm4.1 5.6v11.3h3.5v-5.6c0-1.5.3-2.9 2.1-2.9 1.8 0 1.8 1.7 1.8 3v5.5h3.5v-6.2c0-3-.7-5.4-4.2-5.4-1.7 0-2.9.9-3.3 1.8h-.05V9.1H9.5Z"/>',
    reddit: '<path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z"/>',
    whatsapp: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>',
    email: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 7 9-7"/></g>',
    link: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13.5a4.5 4.5 0 0 0 6.4.5l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.5l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></g>',
    check: '<path d="m4.5 12.5 5 5L19.5 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    more: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></g>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[k]}</svg>`;

  // [icon, name, url]; X gets a labeled button, the rest are icons with a tooltip and an accessible name.
  const SITES = [
    ['x', 'X', `https://x.com/intent/post?text=${enc(TEXT)}&url=${enc(PAGE)}`],
    ['bluesky', 'Bluesky', `https://bsky.app/intent/compose?text=${withUrl}`],
    ['threads', 'Threads', `https://www.threads.com/intent/post?text=${withUrl}`],
    ['facebook', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(PAGE)}`],
    ['linkedin', 'LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${enc(PAGE)}`],
    ['reddit', 'Reddit', `https://www.reddit.com/submit?url=${enc(PAGE)}&title=${enc(TITLE)}`],
    ['whatsapp', 'WhatsApp', `https://wa.me/?text=${withUrl}`],
  ];

  function copyText(s) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(s);
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = s; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  function build(box) {
    const label = box.getAttribute('data-share') || 'Share';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Share this page');
    let html = `<span class="share-lab">${label}</span>`;
    for (const [k, name, url] of SITES) {
      const main = k === 'x';
      html += `<a class="${main ? 'pill share-x' : 'ico'}" href="${url}" target="_blank" rel="noopener"` +
        (main ? '' : ` title="Share on ${name}" aria-label="Share on ${name}"`) + `>${svg(k)}${main ? '<span>Post on X</span>' : ''}</a>`;
    }
    html += `<a class="ico" href="mailto:?subject=${enc(TITLE)}&body=${enc(TEXT + '\n\n' + PAGE)}" title="Share by email" aria-label="Share by email">${svg('email')}</a>`;
    html += `<button type="button" class="pill share-copy">${svg('link')}<span>Copy link</span></button>`;
    if (navigator.share) html += `<button type="button" class="pill share-more">${svg('more')}<span>More</span></button>`;
    html += '<span class="share-status" role="status" aria-live="polite"></span>';
    box.innerHTML = html;

    const copy = box.querySelector('.share-copy');
    const status = box.querySelector('.share-status');
    let timer = null;
    copy.addEventListener('click', () => {
      const done = (ok) => {
        copy.innerHTML = ok ? `${svg('check')}<span>Link copied</span>` : `${svg('link')}<span>Copy failed</span>`;
        copy.classList.toggle('done', ok);
        status.textContent = ok ? 'Link copied to clipboard' : 'Could not copy the link';
        clearTimeout(timer);
        timer = setTimeout(() => {
          copy.innerHTML = `${svg('link')}<span>Copy link</span>`;
          copy.classList.remove('done');
          status.textContent = '';
        }, 2200);
      };
      copyText(PAGE).then(() => done(true), () => done(false));
    });
    const more = box.querySelector('.share-more');
    if (more) more.addEventListener('click', () => {
      navigator.share({ title: TITLE, text: TEXT, url: PAGE }).catch(() => {});
    });
  }

  function init() { document.querySelectorAll('[data-share]').forEach(build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
