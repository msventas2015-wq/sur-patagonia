// Compatibility deployment: keep the existing static 404.html QR flow until
// runtime secrets and the production database are ready for the QR cutover.
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
