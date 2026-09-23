// Scramjet service worker — loads the controller and intercepts proxied requests.
// This file MUST be served from the site root so its scope covers /scramjet-proxy.html
importScripts("/scramjet/controller/controller.sw.js");

addEventListener("fetch", (e) => {
  if ($scramjetController.shouldRoute(e)) {
    e.respondWith($scramjetController.route(e));
  }
});
