'use client';

import { useId, useState } from 'react';
import { TEXTO_MIN_CHARS, PDF_MAX_BYTES } from '@/lib/publicacoes/validation';

export interface UploadFormProps {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  defaultError?: string;
}

export function UploadForm({ action, defaultError }: UploadFormProps) {
  const [erro, setErro] = useState<string | null>(defaultError ?? null);
  const [enviando, setEnviando] = useState(false);
  const textoId = useId();
  const arquivoId = useId();
  const dataId = useId();
  const fonteId = useId();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    const form = event.currentTarget;
    const fd = new FormData(form);
    const textoRaw = (fd.get('textoIntegral') as string | null) ?? '';
    const texto = textoRaw.trim();
    const arquivo = fd.get('arquivo') as File | null;
    const temArquivo = arquivo && arquivo.size > 0;

    if (!texto && !temArquivo) {
      setErro('Cole o texto ou envie um PDF.');
      return;
    }

    if (texto && !temArquivo && texto.length < TEXTO_MIN_CHARS) {
      setErro(
        `O texto da publicação precisa ter ao menos ${TEXTO_MIN_CHARS} caracteres.`,
      );
      return;
    }

    if (temArquivo) {
      if (arquivo.type && arquivo.type !== 'application/pdf') {
        setErro('Apenas arquivos PDF são aceitos.');
        return;
      }
      if (arquivo.size > PDF_MAX_BYTES) {
        setErro('O arquivo excede o limite de 5MB.');
        return;
      }
    }

    setEnviando(true);
    try {
      const resp = await action(fd);
      if (resp && 'error' in resp && resp.error) {
        setErro(resp.error);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-6 rounded-xl bg-surface-container-lowest p-8"
    >
      <div className="grid gap-2">
        <label
          htmlFor={textoId}
          className="font-body text-[10px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant"
        >
          Texto da publicação
        </label>
        <textarea
          id={textoId}
          name="textoIntegral"
          rows={10}
          placeholder="Cole aqui o texto integral publicado no DJe"
          className="rounded-md bg-surface-container-low p-4 font-body text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary/10"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="grid gap-2">
          <label
            htmlFor={arquivoId}
            className="font-body text-[10px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant"
          >
            Arquivo PDF
          </label>
          <input
            id={arquivoId}
            name="arquivo"
            type="file"
            accept="application/pdf"
            className="font-body text-sm text-on-surface"
          />
          <p className="font-body text-[11px] text-on-surface-variant">
            Limite 5 MB. Apenas PDF com texto extraível.
          </p>
        </div>
        <div className="grid gap-2">
          <label
            htmlFor={dataId}
            className="font-body text-[10px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant"
          >
            Data de publicação
          </label>
          <input
            id={dataId}
            name="dataPublicacao"
            type="date"
            className="rounded-md bg-surface-container-low px-3 py-2 font-body text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <label
          htmlFor={fonteId}
          className="font-body text-[10px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant"
        >
          Fonte
        </label>
        <input
          id={fonteId}
          name="fonte"
          type="text"
          placeholder="DJe-TJCE, DJe-TJSP, upload-manual"
          defaultValue="upload-manual"
          className="rounded-md bg-surface-container-low px-3 py-2 font-body text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/10"
        />
      </div>

      {erro && (
        <p
          role="alert"
          className="rounded-md bg-error-container px-4 py-3 font-body text-sm font-medium text-on-error-container"
        >
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="justify-self-start rounded-md bg-primary px-6 py-3 font-body text-sm font-semibold text-on-primary disabled:opacity-60"
      >
        {enviando ? 'Enviando…' : 'Enviar publicação'}
      </button>
    </form>
  );
}
