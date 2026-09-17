// Estrutura de teste para validar o pipeline de export ponta a ponta.
// NÃO é o formato final de asset — isso será definido em docs/DATA_FORMAT.md
// seção por seção (cada uma ainda 🔴 não definida). Este manifesto só prova
// que o editor consegue gerar e baixar um arquivo.
export interface ExportManifest {
  formatVersion: '0.0.0-skeleton'
  generatedAt: string
  tool: 'snes-asset-editor'
  note: string
  sourceImage: {
    fileName: string
    width: number
    height: number
    sizeBytes: number
  } | null
}
