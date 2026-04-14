export const OPENROUTER_VERIFICATION_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "verification_result",
    strict: true,
    schema: {
      type: "object",
      properties: {
        severity: {
          type: "string",
          enum: ["ok", "minor", "major"],
          description: "La gravità dei problemi riscontrati"
        },
        summary: {
          type: "string",
          description: "Riassunto dei problemi o 'ok' se tutto va bene"
        },
        evidence: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Elenco specifico di problemi riscontrati"
        },
        annotations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description: "Tipo di annotazione (es. error, warning, info)",
              },
              text: {
                type: "string",
                description: "Testo errato originale"
              },
              suggestion: {
                type: "string",
                description: "Suggerimento o correzione"
              }
            },
            required: ["type", "text", "suggestion"],
            additionalProperties: false
          },
          description: "Elenco di annotazioni specifiche e correzioni"
        },
        retryHint: {
          type: ["string", "null"],
          description: "Suggerimento per l'eventuale re-prompt al modello (o null se assente)"
        }
      },
      required: ["severity", "summary", "evidence", "annotations", "retryHint"],
      additionalProperties: false
    }
  }
};

export const OPENROUTER_METADATA_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "pdf_metadata",
    strict: true,
    schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Il titolo del documento estratto"
        },
        author: {
          type: "string",
          description: "L'autore del documento"
        },
        year: {
          type: ["string", "number"],
          description: "L'anno di pubblicazione o creazione"
        }
      },
      required: ["title", "author", "year"],
      additionalProperties: false
    }
  }
};
