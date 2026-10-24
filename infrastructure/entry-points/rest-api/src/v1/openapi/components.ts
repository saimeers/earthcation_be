// Piezas comunes del documento OpenAPI: el esquema de seguridad, el error y la paginación (datos declarativos).
export const components = {
  securitySchemes: {
    bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    deployToken: { type: 'apiKey', in: 'header', name: 'x-deploy-token', description: 'Token del CI (DEPLOY_UPLOAD_TOKEN): solo crea, sube y completa versiones del juego' },
  },
  schemas: {
    Error: {
      type: 'object',
      required: ['error'],
      properties: {
        error: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: { type: 'string', description: 'Código estable en mayúsculas, p. ej. LOCATION_NOT_FOUND' },
            message: { type: 'string', description: 'Mensaje en español para el usuario' },
            details: { description: 'Detalle opcional, p. ej. los campos inválidos' },
          },
        },
      },
    },
    PageMeta: {
      type: 'object',
      required: ['page', 'limit', 'total', 'totalPages'],
      properties: {
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        total: { type: 'integer', minimum: 0 },
        totalPages: { type: 'integer', minimum: 1 },
      },
    },
  },
}
