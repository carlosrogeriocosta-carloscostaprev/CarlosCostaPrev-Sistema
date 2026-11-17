'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ArrowsClockwise,
  BookOpen,
  FileText,
  MagnifyingGlass,
  ScalesSimple,
  ShieldCheck,
} from '@/lib/ui/icons';
import {
  PREVIDENCIARIO_BENEFIT_KEYS,
  PREVIDENCIARIO_BENEFITS,
} from '@/lib/previdenciario/catalog';
import {
  useBulkReviewPrevidenciarioPathologies,
  usePrevidenciarioIfbra,
  usePrevidenciarioLegislation,
  usePrevidenciarioPathologies,
  usePrevidenciarioPathology,
  useReviewPrevidenciarioPathology,
  type BenefitHypothesisView,
  type KnowledgeReviewStatus,
  type PathologyKnowledgeView,
} from '@/hooks/previdenciario/usePrevidenciarioKnowledge';

const STATUS_LABELS: Record<KnowledgeReviewStatus, string> = {
  draft: 'Rascunho',
  needs_review: 'Revisão necessária',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  archived: 'Arquivado',
};

const STATUS_CLASSES: Record<KnowledgeReviewStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  needs_review: 'bg-warning/15 text-warning-fg',
  approved: 'bg-success/15 text-success-fg',
  rejected: 'bg-destructive/15 text-destructive',
  archived: 'bg-muted text-muted-foreground',
};

function StatusBadge({ status }: { status: string }) {
  const normalized = status as KnowledgeReviewStatus;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASSES[normalized] ?? STATUS_CLASSES.draft}`}>
      {STATUS_LABELS[normalized] ?? status}
    </span>
  );
}

function CodeList({ title, codes }: { title: string; codes: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1">
        {codes.length ? codes.map((code) => <code key={code} className="rounded bg-muted px-1.5 py-0.5 text-xs">{code}</code>) : <span className="text-xs text-muted-foreground">Não informado</span>}
      </div>
    </div>
  );
}

function benefitLabel(key: string) {
  return PREVIDENCIARIO_BENEFITS[key as keyof typeof PREVIDENCIARIO_BENEFITS]?.displayName ?? key;
}

function PathologyDetail({
  item,
  isPlatformAdmin,
  onClose,
}: {
  item: PathologyKnowledgeView;
  isPlatformAdmin: boolean;
  onClose: () => void;
}) {
  const detailQuery = usePrevidenciarioPathology(item.stableKey);
  const current = detailQuery.data?.data.item ?? item;
  const history = detailQuery.data?.data.history ?? [];
  const review = useReviewPrevidenciarioPathology();
  const [status, setStatus] = useState<KnowledgeReviewStatus>(current.review.status);
  const [note, setNote] = useState(current.review.note ?? '');
  const [summary, setSummary] = useState(current.editorialSummary ?? '');
  const [hypotheses, setHypotheses] = useState<BenefitHypothesisView[]>(current.benefitHypotheses);

  function saveReview() {
    review.mutate({
      stableKey: current.stableKey,
      reviewStatus: status,
      reviewNote: note.trim() || null,
      editorialSummary: summary.trim() || null,
      benefitHypotheses: hypotheses,
    }, {
      onSuccess: () => toast.success('Revisão editorial salva.'),
    });
  }

  function addHypothesis() {
    const used = new Set(hypotheses.map((hypothesis) => hypothesis.benefitKey));
    const benefitKey = PREVIDENCIARIO_BENEFIT_KEYS.find((key) => !used.has(key));
    if (!benefitKey) return;
    setHypotheses((currentHypotheses) => [
      ...currentHypotheses,
      { benefitKey, hypothesis: '', sourceRef: null, reviewStatus: 'needs_review' },
    ]);
  }

  function updateHypothesis(index: number, patch: Partial<BenefitHypothesisView>) {
    setHypotheses((currentHypotheses) => currentHypotheses.map((hypothesis, itemIndex) => itemIndex === index ? { ...hypothesis, ...patch } : hypothesis));
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CardTitle>{current.displayName}</CardTitle>
              <StatusBadge status={current.review.status} />
            </div>
            <CardDescription>
              {current.category} · stable key <code>{current.stableKey}</code>
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <CodeList title="CID-10 — doença ou condição" codes={current.medicalClassification.cid10} />
          <CodeList title="CID-11 — doença ou condição" codes={current.medicalClassification.cid11} />
        </div>

        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><BookOpen size={16} aria-hidden /> CIF — funcionalidade e participação</div>
          <div className="grid gap-4 md:grid-cols-2">
            <CodeList title="Funções do corpo" codes={current.functionalFramework.cif.bodyFunctions} />
            <CodeList title="Estruturas do corpo" codes={current.functionalFramework.cif.bodyStructures} />
            <CodeList title="Atividades e participação" codes={current.functionalFramework.cif.activitiesParticipation} />
            <CodeList title="Fatores ambientais" codes={current.functionalFramework.cif.environmentalFactors} />
          </div>
        </div>

        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} aria-hidden /> IFBrA — instrumento separado</div>
          <p className="text-xs text-muted-foreground">
            {current.functionalFramework.ifbra.instrumentVersion ?? 'Versão não informada'}. Não há mapeamento específico desta patologia no material de origem; nenhum código foi inferido a partir da CIF.
          </p>
        </div>

        {current.editorialSummary && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Resumo educacional revisado</p>
            <p className="whitespace-pre-wrap text-sm">{current.editorialSummary}</p>
          </div>
        )}

        {current.benefitHypotheses.length > 0 && (
          <div className="rounded-lg border border-border p-4">
            <p className="mb-2 text-sm font-semibold">Hipóteses de benefício — referência para análise</p>
            <div className="space-y-2">
              {current.benefitHypotheses.map((hypothesis) => (
                <div key={`${hypothesis.benefitKey}-${hypothesis.hypothesis}`} className="rounded-md bg-muted/50 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium"><span>{benefitLabel(hypothesis.benefitKey)}</span><StatusBadge status={hypothesis.reviewStatus} /></div>
                  <p className="mt-1 text-sm">{hypothesis.hypothesis || 'Sem hipótese editorial descrita.'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Documentos de referência</p>
            <ul className="space-y-1 text-sm">{(current.clinicalContent.documentHints ?? []).map((hint) => <li key={hint} className="flex items-center gap-2"><FileText size={14} aria-hidden />{hint}</li>)}</ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Proveniência</p>
            <p className="break-all text-xs text-muted-foreground">{`${current.provenance.sourceRepo}@${current.provenance.sourcePath}`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Conteúdo clínico extenso disponível na fonte: {current.clinicalContent.hasDiagnosticContent ? 'sim' : 'não'}. Publicação: sempre requer revisão.</p>
          </div>
        </div>

        {history.length > 0 && (
          <div className="rounded-lg border border-border p-4">
            <p className="mb-2 text-sm font-semibold">Histórico editorial</p>
            <ol className="space-y-2">
              {history.map((entry) => (
                <li key={entry.id} className="border-l-2 border-primary/30 pl-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={entry.previousStatus} /><span>→</span><StatusBadge status={entry.nextStatus} /><time className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</time></div>
                  {entry.reviewNote && <p className="mt-1 text-muted-foreground">{entry.reviewNote}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {isPlatformAdmin && (
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} aria-hidden /> Revisão profissional</div>
            <p className="mb-3 text-xs text-muted-foreground">O resumo é educacional. Não inclua diagnóstico, prescrição, cálculo de deficiência ou decisão de concessão.</p>
            <div className="space-y-4">
              <label className="block space-y-1 text-xs font-medium">Resumo educacional<textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={20000} rows={4} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm font-normal" placeholder="Contextualização revisada para apoio profissional, sem diagnóstico ou decisão." /></label>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">Hipóteses de benefício</p><Button type="button" variant="outline" size="sm" onClick={addHypothesis} disabled={hypotheses.length >= PREVIDENCIARIO_BENEFIT_KEYS.length * 2}>Adicionar hipótese</Button></div>
                {hypotheses.map((hypothesis, index) => (
                  <div key={`${hypothesis.benefitKey}-${index}`} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[18rem_1fr_10rem_auto] md:items-center">
                    <select value={hypothesis.benefitKey} onChange={(event) => updateHypothesis(index, { benefitKey: event.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm">{PREVIDENCIARIO_BENEFIT_KEYS.map((key) => <option key={key} value={key}>{benefitLabel(key)}</option>)}</select>
                    <Input value={hypothesis.hypothesis} onChange={(event) => updateHypothesis(index, { hypothesis: event.target.value })} maxLength={2000} placeholder="Explique por que é apenas uma hipótese." />
                    <select value={hypothesis.reviewStatus} onChange={(event) => updateHypothesis(index, { reviewStatus: event.target.value as KnowledgeReviewStatus })} className="h-9 rounded-md border border-border bg-background px-2 text-sm">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setHypotheses((currentHypotheses) => currentHypotheses.filter((_, itemIndex) => itemIndex !== index))}>Remover</Button>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto] md:items-end">
                <label className="space-y-1 text-xs font-medium">Estado<select value={status} onChange={(event) => setStatus(event.target.value as KnowledgeReviewStatus)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="space-y-1 text-xs font-medium">Nota da revisão<Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} placeholder="Registre o que foi conferido ou o que falta revisar." /></label>
                <Button onClick={saveReview} disabled={review.isPending}>{review.isPending ? 'Salvando…' : 'Salvar revisão'}</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BulkReviewBar({ selectedKeys, onClear }: { selectedKeys: string[]; onClear: () => void }) {
  const bulkReview = useBulkReviewPrevidenciarioPathologies();
  const [status, setStatus] = useState<KnowledgeReviewStatus>('approved');
  const [note, setNote] = useState('');

  if (selectedKeys.length === 0) return null;

  function apply() {
    bulkReview.mutate({ stableKeys: selectedKeys, reviewStatus: status, reviewNote: note.trim() || null }, {
      onSuccess: (response) => {
        toast.success(`${response.data.updatedCount} patologia(s) revisada(s).`);
        setNote('');
        onClear();
      },
    });
  }

  return (
    <div className="sticky bottom-4 z-30 flex flex-wrap items-end gap-3 rounded-lg border border-primary/30 bg-card px-4 py-3 shadow-lg">
      <span className="pb-2 text-sm font-medium">{selectedKeys.length} selecionada(s)</span>
      <label className="space-y-1 text-xs font-medium">Novo estado<select value={status} onChange={(event) => setStatus(event.target.value as KnowledgeReviewStatus)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="min-w-[16rem] flex-1 space-y-1 text-xs font-medium">Nota comum<Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} placeholder="Nota opcional para o lote" /></label>
      <Button onClick={apply} disabled={bulkReview.isPending}>{bulkReview.isPending ? 'Aplicando…' : 'Aplicar revisão'}</Button>
      <Button variant="ghost" onClick={onClear}>Cancelar</Button>
    </div>
  );
}

function PathologiesTab({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<PathologyKnowledgeView | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const query = usePrevidenciarioPathologies({ search, category: category || undefined });
  const items = useMemo(() => query.data?.data.items ?? [], [query.data?.data.items]);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);
  const pending = items.filter((item) => item.review.status === 'needs_review').length;
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedKeys.includes(item.stableKey));

  function toggleSelected(stableKey: string) {
    setSelectedKeys((keys) => keys.includes(stableKey) ? keys.filter((key) => key !== stableKey) : [...keys, stableKey]);
  }

  function toggleAllVisible() {
    setSelectedKeys((keys) => allVisibleSelected ? keys.filter((key) => !items.some((item) => item.stableKey === key)) : [...new Set([...keys, ...items.map((item) => item.stableKey)])]);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Resultados</p><p className="mt-1 text-2xl font-semibold">{items.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Revisão necessária</p><p className="mt-1 text-2xl font-semibold text-warning-fg">{pending}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Modelo funcional</p><p className="mt-1 text-2xl font-semibold">CID + CIF</p></CardContent></Card>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1"><MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar por nome, alias ou CID…" /></div>
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-sm"><option value="">Todas as categorias</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><ArrowsClockwise size={16} aria-hidden /> Atualizar</Button>
      </div>
      {isPlatformAdmin && items.length > 0 && <div className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Selecionar todas as patologias visíveis" /><span>Selecionar resultados visíveis</span>{selectedKeys.length > 0 && <span className="text-muted-foreground">({selectedKeys.length} selecionada(s))</span>}</div>}
      {query.isLoading ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Carregando patologias…</p> : query.isError ? <p className="rounded-lg border border-destructive/30 p-6 text-sm text-destructive">Não foi possível carregar a base de patologias.</p> : items.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Nenhuma patologia encontrada com esses filtros.</p> : <div className="grid gap-3 md:grid-cols-2">{items.map((item) => <div key={item.id} className="rounded-lg border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md"><div className="flex items-start gap-3">{isPlatformAdmin && <input type="checkbox" checked={selectedKeys.includes(item.stableKey)} onChange={() => toggleSelected(item.stableKey)} aria-label={`Selecionar ${item.displayName}`} className="mt-1" />}<button type="button" onClick={() => setSelected(item)} className="min-w-0 flex-1 text-left"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{item.displayName}</p><p className="mt-1 text-xs text-muted-foreground">{item.category} · {item.stableKey}</p></div><StatusBadge status={item.review.status} /></div><div className="mt-3 flex flex-wrap gap-1.5">{item.medicalClassification.cid10.slice(0, 4).map((code) => <code key={code} className="rounded bg-muted px-1.5 py-0.5 text-xs">{code}</code>)}<span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-700">{item.functionalFramework.cif.activitiesParticipation.length} CIF</span></div></button></div></div>)}</div>}
      <BulkReviewBar selectedKeys={selectedKeys} onClear={() => setSelectedKeys([])} />
      {selected && <PathologyDetail item={selected} isPlatformAdmin={isPlatformAdmin} onClose={() => setSelected(null)} />}
    </div>
  );
}

function IfbraTab() {
  const query = usePrevidenciarioIfbra();
  const data = query.data?.data;
  return <div className="space-y-4">{query.isLoading ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Carregando referência IFBrA…</p> : <><Card><CardHeader><CardTitle>IFBrA — catálogo de referência</CardTitle><CardDescription>{data?.instrumentVersion ?? 'Versão não informada'}. Os qualificadores são referência e não calculam deficiência.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{(data?.qualifiers ?? []).map((qualifier) => <span key={qualifier.value} className="rounded-md border px-3 py-2 text-xs"><strong>{qualifier.value}</strong> · {qualifier.label} · {qualifier.range}</span>)}</CardContent></Card><div className="grid gap-3 md:grid-cols-2">{(data?.domains ?? []).map((domain) => <Card key={domain.key}><CardHeader><CardTitle className="text-base">{domain.label}</CardTitle><CardDescription>{domain.description}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-1.5">{domain.items.map((item) => <span key={item.code} className="rounded bg-muted px-2 py-1 text-xs"><code>{item.code}</code> {item.label}</span>)}</CardContent></Card>)}</div><p className="text-xs text-muted-foreground">{data?.disclaimer}</p></>}</div>;
}

function LegislationTab() {
  const query = usePrevidenciarioLegislation();
  const data = query.data?.data;
  return <div className="space-y-3">{query.isLoading ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Carregando matriz legislativa…</p> : <>{(data?.items ?? []).map((item) => <Card key={item.id}><CardContent className="space-y-2 pt-5"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{item.provisionRef}</span><StatusBadge status={item.reviewStatus} /><span className="text-xs text-muted-foreground">Confiança: {item.confidence}</span></div><p className="text-sm">{item.summary}</p>{item.source && <a href={item.source.officialUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-2">{item.source.title} — fonte oficial</a>}</CardContent></Card>)}<p className="text-xs text-muted-foreground">{data?.disclaimer}</p></>}</div>;
}

export function PrevidenciarioKnowledgeClient({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const [tab, setTab] = useState<'pathologies' | 'ifbra' | 'legislation'>('pathologies');
  return <div className="flex flex-col gap-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ScalesSimple size={24} aria-hidden /><h1 className="text-2xl font-semibold">Base de conhecimento previdenciária</h1></div><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Referência curada para apoiar casos. CID identifica condições; CIF descreve funcionalidade; IFBrA permanece como instrumento separado; legislação exige revisão pela data do caso.</p></div><span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning-fg">Conteúdo em revisão</span></div><div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning-fg"><strong>Importante:</strong> esta base não diagnostica, não calcula deficiência, não decide benefício e não substitui avaliação médica ou análise jurídica.</div><div className="flex flex-wrap gap-2 border-b border-border pb-2"><Button variant={tab === 'pathologies' ? 'default' : 'outline'} onClick={() => setTab('pathologies')}><BookOpen size={16} aria-hidden /> Patologias</Button><Button variant={tab === 'ifbra' ? 'default' : 'outline'} onClick={() => setTab('ifbra')}><ShieldCheck size={16} aria-hidden /> IFBrA</Button><Button variant={tab === 'legislation' ? 'default' : 'outline'} onClick={() => setTab('legislation')}><FileText size={16} aria-hidden /> Legislação</Button></div>{tab === 'pathologies' ? <PathologiesTab isPlatformAdmin={isPlatformAdmin} /> : tab === 'ifbra' ? <IfbraTab /> : <LegislationTab />}</div>;
}
