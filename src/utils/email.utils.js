const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const baseStyle = `
  font-family: 'Segoe UI', Arial, sans-serif;
  max-width: 520px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
`;

const headerStyle = `
  background: #0f172a;
  padding: 32px 40px 24px;
  text-align: center;
`;

const bodyStyle = `
  padding: 32px 40px;
  color: #374151;
  line-height: 1.6;
`;

const btnStyle = `
  display: inline-block;
  margin: 24px 0;
  padding: 14px 28px;
  background: #0f172a;
  color: #ffffff;
  text-decoration: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.01em;
`;

const footerStyle = `
  padding: 20px 40px;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
`;

const sendPasswordResetEmail = async ({ to, username, resetToken }) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const { error } = await resend.emails.send({
    from:    process.env.EMAIL_FROM || 'noreply@saimers.dev',
    to,
    subject: 'Restablecer contraseña — Earthcation',
    html: `
      <div style="${baseStyle}">
        <div style="${headerStyle}">
          <p style="color:#94a3b8;font-size:11px;letter-spacing:0.15em;margin:0 0 8px;text-transform:uppercase;">
            Plataforma de capacitación
          </p>
          <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;letter-spacing:-0.01em;">
            Earthcation
          </h1>
        </div>
        <div style="${bodyStyle}">
          <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Hola, ${username}</h2>
          <p style="margin:0 0 8px;">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta.
          </p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:14px;">
            Si no realizaste esta solicitud, puedes ignorar este correo con seguridad.
          </p>
          <div style="text-align:center;">
            <a href="${resetUrl}" style="${btnStyle}">Restablecer contraseña</a>
          </div>
          <div style="background:#f1f5f9;border-radius:8px;padding:14px 16px;margin-top:8px;">
            <p style="margin:0;font-size:13px;color:#64748b;">
              Este enlace expira en <strong>15 minutos</strong>. Si el botón no funciona, 
              copia y pega esta URL en tu navegador:
            </p>
            <p style="margin:8px 0 0;font-size:12px;color:#0f172a;word-break:break-all;">
              ${resetUrl}
            </p>
          </div>
        </div>
        <div style="${footerStyle}">
          Earthcation — Capacitación en seguridad minera &nbsp;·&nbsp; saimers.dev
        </div>
      </div>
    `
  });

  if (error) throw Object.assign(new Error('Error al enviar el correo'), { status: 500 });
};

const sendWelcomeEmail = async ({ to, username, temporaryPassword, resetToken }) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const { error } = await resend.emails.send({
    from:    process.env.EMAIL_FROM || 'noreply@saimers.dev',
    to,
    subject: 'Tu cuenta en Earthcation ha sido creada',
    html: `
      <div style="${baseStyle}">
        <div style="${headerStyle}">
          <p style="color:#94a3b8;font-size:11px;letter-spacing:0.15em;margin:0 0 8px;text-transform:uppercase;">
            Plataforma de capacitación
          </p>
          <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;letter-spacing:-0.01em;">
            Earthcation
          </h1>
        </div>
        <div style="${bodyStyle}">
          <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Bienvenido, ${username}</h2>
          <p style="margin:0 0 16px;">
            El administrador ha creado una cuenta para ti en la plataforma de capacitación 
            en seguridad minera <strong>Earthcation</strong>.
          </p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 6px;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
              Tu contraseña temporal
            </p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:0.08em;font-family:monospace;">
              ${temporaryPassword}
            </p>
          </div>

          <p style="margin:0 0 8px;color:#374151;">
            Por seguridad, te recomendamos establecer una contraseña personal antes de iniciar sesión.
          </p>

          <div style="text-align:center;">
            <a href="${resetUrl}" style="${btnStyle}">Establecer mi contraseña</a>
          </div>

          <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:8px;">
            <p style="margin:0;font-size:13px;color:#854d0e;">
              Este enlace para establecer tu contraseña expira en <strong>15 minutos</strong>. 
              Puedes solicitar uno nuevo en la pantalla de inicio de sesión.
            </p>
          </div>
        </div>
        <div style="${footerStyle}">
          Earthcation — Capacitación en seguridad minera &nbsp;·&nbsp; saimers.dev
        </div>
      </div>
    `
  });

  if (error) throw Object.assign(new Error('Error al enviar el correo'), { status: 500 });
};

module.exports = { sendPasswordResetEmail, sendWelcomeEmail };