const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendPasswordResetEmail = async ({ to, username, resetToken }) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const { data, error } = await resend.emails.send({
    from:    process.env.EMAIL_FROM || 'noreply@saimers.dev',
    to,
    subject: 'Restablecer contraseña — Earthcation',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1a1a1a;">Hola, ${username}</h2>
        <p style="color: #444; line-height: 1.6;">
          Recibimos una solicitud para restablecer tu contraseña en Earthcation.
          Si no fuiste tú, puedes ignorar este correo.
        </p>
        <a href="${resetUrl}"
           style="display: inline-block; margin: 24px 0; padding: 12px 24px;
                  background: #2563eb; color: #fff; text-decoration: none;
                  border-radius: 6px; font-weight: bold;">
          Restablecer contraseña
        </a>
        <p style="color: #888; font-size: 13px;">
          Este enlace expira en <strong>15 minutos</strong>.<br>
          Si el botón no funciona, copia este enlace en tu navegador:<br>
          <span style="color: #2563eb;">${resetUrl}</span>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #aaa; font-size: 12px;">Earthcation — Capacitación minera</p>
      </div>
    `
  });

  if (error) {
    console.error('[EMAIL ERROR]', error);
    const err = new Error('Error al enviar el correo');
    err.status = 500;
    throw err;
  }

  return data;
};

module.exports = { sendPasswordResetEmail };