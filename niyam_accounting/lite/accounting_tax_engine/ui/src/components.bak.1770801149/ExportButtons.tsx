import { Download, FileText } from 'lucide-react'

interface ExportButtonsProps {
  csvUrl: string;
  pdfUrl?: string;
  label?: string;
}

export function ExportButtons({ csvUrl, pdfUrl, label }: ExportButtonsProps) {
  return (
    <div className="flex gap-1.5">
      <a href={csvUrl} download className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors">
        <Download className="w-3 h-3" />{label ? `${label} CSV` : 'CSV'}
      </a>
      {pdfUrl && (
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition-colors">
          <FileText className="w-3 h-3" />{label ? `${label} PDF` : 'PDF'}
        </a>
      )}
    </div>
  )
}
