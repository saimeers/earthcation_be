import type { Sequelize } from 'sequelize'

// Registro de auditoría de solo inserción: la tabla y un disparador que rechaza UPDATE, DELETE y TRUNCATE, de modo
// que ni un error de la app ni una consulta a mano pueden alterar el histórico (hay que quitar el disparador a propósito).
export const name = '0002_audit_logs'

const GUARD = `
  CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
  BEGIN
    RAISE EXCEPTION 'audit_logs es de solo inserción: no se edita ni se borra';
  END;
  $$ LANGUAGE plpgsql`

export const up = async ({ context }: { readonly context: Sequelize }): Promise<void> => {
  await context.model('AuditLog').sync()
  await context.query(GUARD)
  await context.query('DROP TRIGGER IF EXISTS audit_logs_no_change ON audit_logs')
  await context.query('CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only()')
  await context.query('DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs')
  await context.query('CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only()')
}
