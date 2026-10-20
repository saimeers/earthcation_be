// La IP del visitante detrás de Cloudflare vive en @earthcation/rest-api (middlewares/cloudflare.ts) con
// CF_EDGE_SECRET inyectado por el composition root; el limitador de legacy la sigue pidiendo aquí
const { edge } = require('../../container');

module.exports = { clientIp: edge.clientIp, isCloudflare: edge.isCloudflare, fromCloudflare: edge.fromCloudflare };
