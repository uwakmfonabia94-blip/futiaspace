// js/router.js
const routes = {};
const dynamicRoutes = {};

export function route(path, handler) {
  if (path.includes(':')) {
    dynamicRoutes[path] = handler;
  } else {
    routes[path] = handler;
  }
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function resolve() {
  const rawHash = window.location.hash.slice(1);
  const path = rawHash || '/landing';
  const [cleanPath] = path.split('?');

  if (routes[cleanPath]) return routes[cleanPath]();

  for (const pattern in dynamicRoutes) {
    const parts = cleanPath.split('/');
    const patternParts = pattern.split('/');
    if (parts.length === patternParts.length) {
      const params = {};
      let match = true;
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          const paramName = patternParts[i].slice(1);
          params[paramName] = parts[i];
        } else if (patternParts[i] !== parts[i]) {
          match = false;
          break;
        }
      }
      if (match) return dynamicRoutes[pattern](params);
    }
  }

  // ultimate fallback
  navigate('/landing');
}

window.addEventListener('hashchange', resolve);