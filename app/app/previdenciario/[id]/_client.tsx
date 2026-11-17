"use client";

import Link from "next/link";
import { useState } from "react";

import {
  ArrowsClockwise,
  CaretLeft,
  CheckCircle,
  Clock,
  DownloadSimple,
  FileText,
  Paperclip,
  Plus,
  Warning,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreatePrevidenciarioDeadline,
  useCreatePrevidenciarioDocument,
  useDownloadPrevidenciarioDocument,
  usePrevidenciarioCase,
  useReviewPrevidenciarioDocument,
  useUpdatePrevidenciarioPendency,
} from "@/hooks/previdenciario/usePrevidenciarioCases";

function formatDate(value: string | null | undefined) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "Aberto",
    completed: "Concluído",
    archived: "Arquivado",
    resolved: "Resolvida",
    dismissed: "Descartada",
    cancelled: "Cancelado",
    draft: "Rascunho",
    needs_review: "Aguardando revisão",
    approved: "Aprovado",
    rejected: "Rejeitado",
  };
  return labels[status] ?? status;
}

function NewDeadlineDialog({ caseId, open, onOpenChange }: { caseId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreatePrevidenciarioDeadline();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [kind, setKind] = useState<"external" | "internal" | "reminder">("internal");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await create.mutateAsync({ caseId, title: title.trim(), due_at: new Date(dueAt).toISOString(), kind });
    setTitle("");
    setDueAt("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo prazo</DialogTitle>
          <DialogDescription>Registre um prazo operacional. Regras jurídicas devem permanecer vinculadas à fonte e à versão revisada.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm"><span className="font-medium">Título</span><Input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Conferir exigência do Meu INSS" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm"><span className="font-medium">Data e hora</span><Input required type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
            <label className="block space-y-1.5 text-sm"><span className="font-medium">Tipo</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="internal">Interno</option><option value="external">Órgão externo</option><option value="reminder">Lembrete</option></select></label>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Salvar prazo"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewDocumentDialog({ caseId, open, onOpenChange }: { caseId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreatePrevidenciarioDocument();
  const [kind, setKind] = useState("documento_administrativo");
  const [file, setFile] = useState<File | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    await create.mutateAsync({ caseId, kind: kind.trim(), file });
    setFile(null);
    setKind("documento_administrativo");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Adicionar documento</DialogTitle><DialogDescription>O arquivo será validado, armazenado em área privada e registrado com hash SHA-256 para revisão profissional.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm"><span className="font-medium">Tipo</span><Input required value={kind} onChange={(event) => setKind(event.target.value)} placeholder="Ex.: CNIS, laudo ou procuração" /></label>
          <label className="block space-y-1.5 text-sm"><span className="font-medium">Arquivo</span><Input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span className="block text-xs text-muted-foreground">Formatos aceitos: PDF, JPEG, PNG e WebP. Limite de 25 MB.</span></label>
          {file ? <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Selecionado: <span className="font-medium text-foreground">{file.name}</span> · {Math.ceil(file.size / 1024)} KB</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={create.isPending || !file}>{create.isPending ? "Enviando…" : "Enviar documento"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PrevidenciarioCaseDetailClient({ caseId }: { caseId: string }) {
  const query = usePrevidenciarioCase(caseId);
  const updatePendency = useUpdatePrevidenciarioPendency();
  const reviewDocument = useReviewPrevidenciarioDocument();
  const downloadDocument = useDownloadPrevidenciarioDocument();
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const data = query.data?.data;

  if (query.isLoading) {
    return <div className="space-y-4 p-6"><Skeleton className="h-10 w-2/3" /><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div></div>;
  }

  if (query.isError || !data) {
    return <div className="p-6"><Card className="p-8 text-center"><Warning size={30} className="mx-auto text-error-fg" aria-hidden /><p className="mt-3 font-medium">Caso não encontrado ou indisponível.</p><Button asChild className="mt-4" variant="outline"><Link href="/app/previdenciario">Voltar ao quadro</Link></Button></Card></div>;
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><Link href="/app/previdenciario" className="inline-flex items-center gap-1 hover:text-foreground"><CaretLeft size={16} aria-hidden /> Casos previdenciários</Link><span>/</span><span className="truncate">{data.title}</span></div>

      <header className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 lg:flex-row lg:items-start">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{data.stage.name}</span><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{statusLabel(data.status)}</span></div><p className="mt-2 text-sm text-muted-foreground">{data.benefit?.display_name ?? data.service?.display_name ?? "Classificação pendente"} · aberto em {formatDate(data.opened_at)}</p></div><Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><ArrowsClockwise size={15} aria-hidden /> Atualizar</Button></header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumo do caso">
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Completude</p><p className="mt-1 text-lg font-semibold">{data.completeness.is_complete ? "Pronto para revisão" : "Ações necessárias"}</p><p className="mt-1 text-xs text-muted-foreground">{data.completeness.missing.length ? data.completeness.missing.join(" · ") : "Nenhum campo crítico pendente"}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Pendências</p><p className="mt-1 text-lg font-semibold">{data.pendencies.filter((item) => item.status === "open").length} abertas</p><p className="mt-1 text-xs text-muted-foreground">{data.pendencies.length} registradas no total</p></Card>
        <Card className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Protocolo</p><p className="mt-1 truncate text-lg font-semibold">{data.protocol_number ?? "Não informado"}</p><p className="mt-1 text-xs text-muted-foreground">Responsável: {data.responsible_user_id ? "definido" : "pendente"}</p></Card>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-semibold">Pendências</h2><p className="text-xs text-muted-foreground">Ações que impedem a completude do caso.</p></div><Warning size={20} className="text-warning-fg" aria-hidden /></div><div className="divide-y divide-border">{data.pendencies.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhuma pendência registrada.</p> : data.pendencies.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.description ?? `Ação: ${item.action}`} · {statusLabel(item.status)}</p></div>{item.status === "open" && <Button size="sm" variant="outline" disabled={updatePendency.isPending} onClick={() => updatePendency.mutate({ caseId, pendencyId: item.id, status: "resolved" })}>Resolver</Button>}</div>)}</div></Card>

        <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-semibold">Prazos</h2><p className="text-xs text-muted-foreground">Controle operacional com fonte e regra versionada.</p></div><Button size="sm" variant="outline" onClick={() => setDeadlineOpen(true)}><Plus size={15} aria-hidden /> Novo prazo</Button></div><div className="divide-y divide-border">{data.deadlines.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum prazo registrado.</p> : data.deadlines.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 p-4"><div className="flex min-w-0 items-start gap-3"><Clock size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden /><div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.due_at)} · {statusLabel(item.status)}</p></div></div><span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">{item.kind}</span></div>)}</div></Card>

        <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="font-semibold">Documentos</h2><p className="text-xs text-muted-foreground">Metadados, hash e revisão humana.</p></div><Button size="sm" variant="outline" onClick={() => setDocumentOpen(true)}><Plus size={15} aria-hidden /> Adicionar</Button></div><div className="divide-y divide-border">{data.documents.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum documento registrado.</p> : data.documents.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 p-4"><div className="flex min-w-0 items-start gap-3"><FileText size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden /><div className="min-w-0"><p className="truncate text-sm font-medium">{item.file_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.kind} · versão {item.version}</p></div></div><div className="flex items-center gap-2"><Button size="sm" variant="ghost" aria-label={`Abrir ${item.file_name}`} disabled={downloadDocument.isPending} onClick={() => { void downloadDocument.mutateAsync({ caseId, documentId: item.id }).then((response) => window.open(response.data.url, "_blank", "noopener,noreferrer")); }}><DownloadSimple size={16} aria-hidden /></Button><select aria-label={`Revisão de ${item.file_name}`} value={item.review_status} disabled={reviewDocument.isPending} onChange={(event) => reviewDocument.mutate({ caseId, documentId: item.id, review_status: event.target.value as "draft" | "needs_review" | "approved" | "rejected" })} className="max-w-[9rem] rounded border border-border bg-background px-1.5 py-1 text-[11px]"><option value="draft">Rascunho</option><option value="needs_review">Aguardando revisão</option><option value="approved">Aprovado</option><option value="rejected">Rejeitado</option></select></div></div>)}</div></Card>

        <Card className="overflow-hidden"><div className="border-b border-border p-4"><h2 className="font-semibold">Histórico</h2><p className="text-xs text-muted-foreground">Eventos do ciclo de vida do caso.</p></div><div className="divide-y divide-border">{data.events.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nenhum evento registrado.</p> : data.events.slice().reverse().map((item) => <div key={item.id} className="flex gap-3 p-4"><CheckCircle size={17} className="mt-0.5 shrink-0 text-success-fg" aria-hidden /><div><p className="text-sm font-medium">{statusLabel(item.kind)}</p><p className="mt-1 text-xs text-muted-foreground">{item.body ?? "Atualização registrada"} · {formatDateTime(item.created_at)}</p></div></div>)}</div></Card>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground"><Paperclip size={15} aria-hidden /><span>Arquivos binários permanecem no Storage privado; o acesso é liberado por URL assinada e expira automaticamente.</span></div>

      <NewDeadlineDialog caseId={caseId} open={deadlineOpen} onOpenChange={setDeadlineOpen} />
      <NewDocumentDialog caseId={caseId} open={documentOpen} onOpenChange={setDocumentOpen} />
    </div>
  );
}
