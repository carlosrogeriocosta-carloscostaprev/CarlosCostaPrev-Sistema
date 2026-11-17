"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useT } from "@/hooks/i18n/useT";

import {
  ArrowCircleUp,
  ArrowsClockwise,
  Clock,
  CheckCircle,
  ClipboardText,
  Funnel,
  MagnifyingGlass,
  Plus,
  ScalesSimple,
  Warning,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { primeiroPreenchido } from "@/lib/previdenciario/primeiro-preenchido";
import {
  useCreatePrevidenciarioCase,
  usePrevidenciarioCases,
  usePrevidenciarioStages,
  useTransitionPrevidenciarioCase,
  type PrevidenciarioCaseListItem,
  type PrevidenciarioStage,
} from "@/hooks/previdenciario/usePrevidenciarioCases";

type T = ReturnType<typeof useT>;

function statusLabels(t: T) {
  return {
    open: t("Abertos"),
    completed: t("Concluídos"),
    archived: t("Arquivados"),
  } as const;
}

function stageColor(stage: PrevidenciarioStage) {
  return stage.color ?? "var(--color-accent)";
}

function CaseCard({
  item,
  stages,
  onMove,
  moving,
}: {
  item: PrevidenciarioCaseListItem;
  stages: PrevidenciarioStage[];
  onMove: (caseId: string, stageId: string) => void;
  moving: boolean;
}) {
  const t = useT();
  const classification = primeiroPreenchido(item.benefit?.display_name, item.service?.display_name, t("Classificação pendente"));
  const hasPending = item.pending_count > 0;

  return (
    <article className="group rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/app/previdenciario/${item.id}`} className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground group-hover:text-primary">
            {item.title}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{classification}</p>
        </Link>
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: stageColor(item.stage) }}
          title={item.stage.name}
          aria-label={`${t("Etapa:")} ${item.stage.name}`}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {item.protocol_number ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{t("Protocolo")} {item.protocol_number}</span>
        ) : (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning-fg">{t("Sem protocolo")}</span>
        )}
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
          {item.responsible_user_id ? t("Responsável definido") : t("Sem responsável")}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
        <span className={hasPending ? "inline-flex items-center gap-1 text-xs text-warning-fg" : "inline-flex items-center gap-1 text-xs text-success-fg"}>
          {hasPending ? <Warning size={14} aria-hidden /> : <CheckCircle size={14} aria-hidden />}
          {hasPending ? `${item.pending_count} ${t("pendência(s)")}` : t("Completo")}
        </span>
        <select
          aria-label={`${t("Mover")} ${item.title}`}
          value={item.stage_id}
          disabled={moving}
          onChange={(event) => onMove(item.id, event.target.value)}
          className="max-w-[8.5rem] rounded border border-border bg-background px-1.5 py-1 text-[11px] text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function NewCaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const create = useCreatePrevidenciarioCase();
  const [contactId, setContactId] = useState("");
  const [title, setTitle] = useState("");
  const [benefitKey, setBenefitKey] = useState("");
  const [serviceKey, setServiceKey] = useState("");
  const [protocol, setProtocol] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await create.mutateAsync({
      contact_id: contactId.trim(),
      title: title.trim(),
      benefit_key: benefitKey.trim() || null,
      service_key: serviceKey.trim() || null,
      protocol_number: protocol.trim() || null,
    });
    setContactId("");
    setTitle("");
    setBenefitKey("");
    setServiceKey("");
    setProtocol("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Novo caso previdenciário")}</DialogTitle>
          <DialogDescription>
            {t("Cadastre o caso e complete a classificação, protocolo e responsável na sequência. Campos faltantes viram pendências acionáveis.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">{t("ID do contato")}</span>
              <Input required value={contactId} onChange={(event) => setContactId(event.target.value)} placeholder={t("UUID do contato em Contatos")} />
              <span className="text-xs text-muted-foreground">{t("O caso é sempre vinculado a um contato existente e nunca cria uma pessoa duplicada.")}</span>
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">{t("Título do caso")}</span>
              <Input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Ex.: Revisão de aposentadoria por idade")} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("Stable key do benefício")}</span>
              <Input value={benefitKey} onChange={(event) => setBenefitKey(event.target.value)} placeholder="Ex.: aposentadoria_idade_urbana_rural" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">{t("Stable key do serviço")}</span>
              <Input value={serviceKey} onChange={(event) => setServiceKey(event.target.value)} placeholder="Ex.: extrato_cnis" />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">{t("Protocolo (opcional)")}</span>
              <Input value={protocol} onChange={(event) => setProtocol(event.target.value)} placeholder={t("Número do protocolo ou requerimento")} />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancelar")}</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t("Criando…") : t("Criar caso")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PrevidenciarioCasesClient() {
  const t = useT();
  const STATUS_LABELS = statusLabels(t);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"open" | "completed" | "archived">("open");
  const [stageId, setStageId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const stagesQuery = usePrevidenciarioStages();
  const casesQuery = usePrevidenciarioCases({ status, stage_id: stageId || undefined, search: search.trim() || undefined });
  const transition = useTransitionPrevidenciarioCase();
  const stages = useMemo(() => stagesQuery.data?.data ?? [], [stagesQuery.data]);
  const cases = useMemo(() => casesQuery.data?.data ?? [], [casesQuery.data]);

  const columns = useMemo(
    () => stages.map((stage) => ({ stage, cases: cases.filter((item) => item.stage_id === stage.id) })),
    [cases, stages],
  );

  const handleMove = async (caseId: string, toStageId: string) => {
    setMovingCaseId(caseId);
    try {
      await transition.mutateAsync({ caseId, to_stage_id: toStageId });
    } finally {
      setMovingCaseId(null);
    }
  };

  return (
    <div className="space-y-5 p-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <ScalesSimple size={24} weight="duotone" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("Casos previdenciários")}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("Um quadro de trabalho para benefícios, serviços, pendências, prazos e documentos — com revisão profissional em cada etapa.")}
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} weight="bold" aria-hidden />
          {t("Novo caso")}
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label={t("Resumo de casos")}>
        <Card className="border-l-4 border-l-primary p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Casos no quadro")}</p>
          <p className="mt-1 text-2xl font-semibold">{cases.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("resultado do filtro atual")}</p>
        </Card>
        <Card className="border-l-4 border-l-warning p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Com pendências")}</p>
          <p className="mt-1 text-2xl font-semibold">{cases.filter((item) => item.pending_count > 0).length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("exigem ação da equipe")}</p>
        </Card>
        <Card className="border-l-4 border-l-success p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Completos")}</p>
          <p className="mt-1 text-2xl font-semibold">{cases.filter((item) => item.completeness.is_complete).length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("classificação e protocolo preenchidos")}</p>
        </Card>
      </section>

      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Buscar por título ou protocolo")} className="h-9 pl-8" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Funnel size={16} aria-hidden />
          <span className="sr-only">{t("Status")}</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="sr-only">{t("Etapa")}</span>
          <select value={stageId} onChange={(event) => setStageId(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground">
            <option value="">{t("Todas as etapas")}</option>
            {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
        </label>
        {(search || status !== "open" || stageId) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatus("open"); setStageId(""); }}>{t("Limpar filtros")}</Button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { void stagesQuery.refetch(); void casesQuery.refetch(); }} disabled={stagesQuery.isFetching || casesQuery.isFetching}>
          <ArrowsClockwise size={15} aria-hidden /> {t("Atualizar")}
        </Button>
      </section>

      {stagesQuery.isLoading || casesQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-72 rounded-xl" />)}
        </div>
      ) : stagesQuery.isError || casesQuery.isError ? (
        <Card className="p-8 text-center">
          <Warning size={28} className="mx-auto text-error-fg" aria-hidden />
          <p className="mt-3 font-medium">{t("Não foi possível carregar o quadro previdenciário.")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("Verifique sua sessão e tente novamente.")}</p>
          <Button className="mt-4" variant="outline" onClick={() => { void stagesQuery.refetch(); void casesQuery.refetch(); }}>{t("Tentar novamente")}</Button>
        </Card>
      ) : stages.length === 0 ? (
        <Card className="p-8 text-center">
          <ClipboardText size={32} className="mx-auto text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">{t("Nenhuma etapa previdenciária configurada.")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("Um manager precisa ativar as etapas do quadro da organização.")}</p>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="grid min-w-[1100px] grid-cols-5 gap-3 xl:grid-cols-9">
            {columns.map(({ stage, cases: columnCases }) => (
              <section key={stage.id} className="min-h-[19rem] rounded-xl bg-muted/45 p-2.5" aria-label={stage.name}>
                <header className="mb-2 flex items-center justify-between gap-2 px-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stageColor(stage) }} aria-hidden />
                    <h2 className="truncate text-xs font-semibold uppercase tracking-wide">{stage.name}</h2>
                  </div>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{columnCases.length}</span>
                </header>
                <div className="space-y-2">
                  {columnCases.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/80 px-2 py-8 text-center text-xs text-muted-foreground">{t("Nenhum caso nesta etapa")}</div>
                  ) : columnCases.map((item) => (
                    <CaseCard key={item.id} item={item} stages={stages} onMove={handleMove} moving={movingCaseId === item.id} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        <Clock size={16} aria-hidden />
        <span>{t("Os prazos e documentos aparecem dentro de cada caso. A tela de detalhe será o centro da operação diária.")}</span>
        <ArrowCircleUp size={16} className="ml-auto text-primary" aria-hidden />
      </div>

      <NewCaseDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
