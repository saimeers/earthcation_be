const fs = require('fs');
const router = require('express').Router();
const { getPublished } = require('../config/deployStorage');
const { headersFor } = require('../services/deploy.service');

/**
 * Solo en desarrollo (sin R2): imita al Worker de play.earthcation.saimers.dev sobre la carpeta local.
 * /play-local/ → versión activa (current.json), /play-local/v/<id>/ → vista previa (sin validar token).
 */
router.get(/^\/(.*)$/, async (req, res) => {
  const published = getPublished();
  let rest = req.params[0];
  let prefix;

  const preview = rest.match(/^v\/([0-9a-f-]{36})\/?(.*)$/i);
  if (preview) {
    prefix = `builds/${preview[1]}/`;
    rest = preview[2];
  } else {
    try {
      prefix = JSON.parse(await published.getBuffer('current.json')).prefix;
    } catch {
      return res.status(404).send('No hay una versión activa del juego');
    }
  }
  // Sin la barra final las rutas relativas del index (Build/...) apuntarían fuera de la versión
  const [pathname, query] = req.originalUrl.split('?');
  if (rest === '' && !pathname.endsWith('/')) return res.redirect(`${pathname}/${query ? `?${query}` : ''}`);
  if (rest === '' || rest.endsWith('/')) rest += 'index.html';

  const file = published.full(prefix + rest);
  if (!fs.existsSync(file)) return res.status(404).send('Archivo no encontrado');
  const { contentType, contentEncoding, cacheControl } = headersFor(rest);
  res.set({ 'Content-Type': contentType, 'Cache-Control': cacheControl });
  if (contentEncoding) res.set('Content-Encoding', contentEncoding);
  fs.createReadStream(file).pipe(res);
});

module.exports = router;
