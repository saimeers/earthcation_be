const { BlockList, isIP } = require('net');

/**
 * Cloudflare's address ranges, from https://www.cloudflare.com/ips/
 * (last changed 2023-09-28). Update them if Cloudflare publishes new ones.
 */
const CLOUDFLARE_IPV4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
const CLOUDFLARE_IPV6 = [
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

const cloudflare = new BlockList();
for (const range of CLOUDFLARE_IPV4) {
  const [address, prefix] = range.split('/');
  cloudflare.addSubnet(address, Number(prefix), 'ipv4');
}
for (const range of CLOUDFLARE_IPV6) {
  const [address, prefix] = range.split('/');
  cloudflare.addSubnet(address, Number(prefix), 'ipv6');
}

const normalize = (ip) => (typeof ip === 'string' ? ip.replace(/^::ffff:(?=\d+\.)/, '') : '');

const isCloudflare = (ip) => {
  const clean = normalize(ip);
  const version = isIP(clean);
  return version !== 0 && cloudflare.check(clean, version === 4 ? 'ipv4' : 'ipv6');
};

/**
 * The visitor's IP. Behind Cloudflare's proxy, req.ip (with `trust proxy` 1)
 * is a Cloudflare server shared by many visitors, and the visitor's own IP
 * comes in CF-Connecting-IP. That header is only believed when the request
 * really arrives from a Cloudflare address: anyone calling the origin
 * directly could set it to anything.
 * @param {import('express').Request} req
 */
const clientIp = (req) => {
  const forwarded = normalize(req.headers['cf-connecting-ip']?.trim());
  if (forwarded && isIP(forwarded) && isCloudflare(req.ip)) return forwarded;
  return normalize(req.ip) || req.ip;
};

module.exports = { clientIp, isCloudflare };
