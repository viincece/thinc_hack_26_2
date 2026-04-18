"use client";

import { useState } from "react";
import { Check, Image as ImageIcon, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFECT_LIBRARY } from "./defect-library";
import {
  Checkbox,
  FieldShell,
  LongText,
  Select,
  TextInput,
  YesNoPicker,
} from "./fields";
import {
  IMMEDIATE_ACTION_KEYS,
  IMMEDIATE_ACTION_LABELS,
  PREVENTIVE_KEYS,
  PREVENTIVE_LABELS,
  SIXM,
  type EightDDoc,
  type FailureImage,
  type FieldMetaMap,
  type ImmediateActionKey,
  type PreventiveKey,
  type SixM,
  type TeamMember,
} from "./eight-d-doc";

type CommonProps = {
  doc: EightDDoc;
  meta: FieldMetaMap;
  onField: (path: string, value: unknown) => void;
  onAsk: (path: string, label: string) => void;
  disabled?: boolean;
};

function M(meta: FieldMetaMap, path: string) {
  return meta[path];
}

/* =============================================================== *
 *  D0 — Header
 * =============================================================== */

function ContactColumn({
  side,
  label,
  doc,
  meta,
  onField,
  onAsk,
  disabled,
}: CommonProps & { side: "customer" | "supplier"; label: string }) {
  const block = doc[side];
  const fields: Array<[keyof typeof block, string, string]> = [
    ["complaintNo", "Complaint no.", "e.g. REK-2026-0042"],
    ["articleNr", "Article no.", "e.g. ART-00001"],
    ["articleName", "Article name", "Motor Controller MC-200"],
    ["drawingIndex", "Drawing index", "Rev B"],
    ["contactPerson", "Contact person", "Full name"],
    ["email", "Email", "name@company.com"],
    ["phone", "Phone", "+49 …"],
  ];
  return (
    <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="space-y-1.5">
        {fields.map(([k, lab, ph]) => {
          const path = `${side}.${String(k)}`;
          return (
            <FieldShell
              key={path}
              path={path}
              label={lab}
              meta={M(meta, path)}
              compact
              onAiDraft={() => onAsk(path, `${label} — ${lab}`)}
              disabled={disabled}
            >
              <TextInput
                value={(block[k] as string) ?? ""}
                onChange={(v) => onField(path, v)}
                placeholder={ph}
                disabled={disabled}
                type={k === "email" ? "email" : k === "phone" ? "tel" : "text"}
              />
            </FieldShell>
          );
        })}
      </div>
    </div>
  );
}

export function SectionD0(props: CommonProps) {
  const { doc, meta, onField, onAsk, disabled } = props;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldShell
          path="complaintDate"
          label="Complaint date"
          meta={M(meta, "complaintDate")}
          onAiDraft={() => onAsk("complaintDate", "Complaint date")}
          disabled={disabled}
          required
        >
          <TextInput
            type="date"
            value={doc.complaintDate}
            onChange={(v) => onField("complaintDate", v)}
            disabled={disabled}
          />
        </FieldShell>
        <FieldShell
          path="reportDate"
          label="Report date"
          meta={M(meta, "reportDate")}
          onAiDraft={() => onAsk("reportDate", "Report date")}
          disabled={disabled}
          required
        >
          <TextInput
            type="date"
            value={doc.reportDate}
            onChange={(v) => onField("reportDate", v)}
            disabled={disabled}
          />
        </FieldShell>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ContactColumn {...props} side="customer" label="Customer" />
        <ContactColumn {...props} side="supplier" label="Supplier" />
      </div>
    </div>
  );
}

/* =============================================================== *
 *  D1 — Team
 * =============================================================== */

function MemberRow({
  member,
  onChange,
  onRemove,
  disabled,
}: {
  member: TeamMember;
  onChange: (m: TeamMember) => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
      <TextInput
        value={member.name ?? ""}
        onChange={(v) => onChange({ ...member, name: v })}
        placeholder="Name"
        disabled={disabled}
      />
      <TextInput
        value={member.department ?? ""}
        onChange={(v) => onChange({ ...member, department: v })}
        placeholder="Department"
        disabled={disabled}
      />
      <TextInput
        value={member.contact ?? ""}
        onChange={(v) => onChange({ ...member, contact: v })}
        placeholder="Email / phone"
        disabled={disabled}
      />
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onRemove}
          className="h-8 w-8"
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <span className="w-8" />
      )}
    </div>
  );
}

export function SectionD1({
  doc,
  meta,
  onField,
  onAsk,
  disabled,
}: CommonProps) {
  const addMember = () => onField("team", [...doc.team, {}]);
  const updateMember = (idx: number, m: TeamMember) => {
    const next = [...doc.team];
    next[idx] = m;
    onField("team", next);
  };
  const removeMember = (idx: number) => {
    onField(
      "team",
      doc.team.filter((_, i) => i !== idx),
    );
  };

  return (
    <div className="space-y-3">
      <FieldShell
        path="champion"
        label="Champion"
        meta={M(meta, "champion")}
        onAiDraft={() => onAsk("champion", "Champion")}
        disabled={disabled}
        required
      >
        <MemberRow
          member={doc.champion}
          onChange={(m) => onField("champion", m)}
          disabled={disabled}
        />
      </FieldShell>
      <FieldShell
        path="coordinator"
        label="Coordinator"
        meta={M(meta, "coordinator")}
        onAiDraft={() => onAsk("coordinator", "Coordinator")}
        disabled={disabled}
        required
      >
        <MemberRow
          member={doc.coordinator}
          onChange={(m) => onField("coordinator", m)}
          disabled={disabled}
        />
      </FieldShell>
      <FieldShell
        path="team"
        label={`Team members (${doc.team.length})`}
        meta={M(meta, "team")}
        onAiDraft={() => onAsk("team", "Team members")}
        disabled={disabled}
      >
        <div className="space-y-1.5">
          {doc.team.length === 0 ? (
            <div className="text-xs italic text-zinc-400">
              No team members yet.
            </div>
          ) : (
            doc.team.map((m, i) => (
              <MemberRow
                key={i}
                member={m}
                onChange={(v) => updateMember(i, v)}
                onRemove={() => removeMember(i)}
                disabled={disabled}
              />
            ))
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={addMember}
            disabled={disabled}
          >
            <Plus className="h-3.5 w-3.5" />
            Add member
          </Button>
        </div>
      </FieldShell>
    </div>
  );
}

/* =============================================================== *
 *  D2 — Problem description
 * =============================================================== */

export function SectionD2({
  doc,
  meta,
  onField,
  onAsk,
  disabled,
}: CommonProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);

  const onPickFile = async (files: FileList | null) => {
    if (!files) return;
    const next: FailureImage[] = [...doc.failureImages];
    for (const f of Array.from(files)) {
      const dataUrl = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.readAsDataURL(f);
      });
      next.push({ name: f.name, size: f.size, dataUrl });
    }
    onField("failureImages", next);
  };
  const toggleLibraryImage = (photo: { url: string; label: string }) => {
    const exists = doc.failureImages.some((i) => i.url === photo.url);
    if (exists) {
      onField(
        "failureImages",
        doc.failureImages.filter((i) => i.url !== photo.url),
      );
    } else {
      onField("failureImages", [
        ...doc.failureImages,
        { name: photo.label, url: photo.url },
      ]);
    }
  };
  const removeImage = (idx: number) => {
    onField(
      "failureImages",
      doc.failureImages.filter((_, i) => i !== idx),
    );
  };

  return (
    <div className="space-y-3">
      <FieldShell
        path="problem"
        label="Problem description"
        meta={M(meta, "problem")}
        onAiDraft={() => onAsk("problem", "Problem description")}
        disabled={disabled}
        required
        hint="Facts only — what, where, when, how often. Keep it short."
      >
        <LongText
          value={doc.problem}
          onChange={(v) => onField("problem", v)}
          placeholder="Describe the failure mode, affected parts, and observation context."
          rows={4}
          disabled={disabled}
        />
      </FieldShell>

      <FieldShell
        path="failureImages"
        label="Failure pictures"
        meta={M(meta, "failureImages")}
        disabled={disabled}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 ${disabled ? "pointer-events-none opacity-50" : ""}`}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload image(s)
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files)}
                disabled={disabled}
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLibraryOpen((p) => !p)}
              disabled={disabled}
              title="Pick from the defect photo library"
              className="h-auto py-2"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {libraryOpen ? "Hide library" : "Pick from library"}
              <span className="ml-1 rounded bg-zinc-100 px-1 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {DEFECT_LIBRARY.length}
              </span>
            </Button>
          </div>

          {libraryOpen ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-1 text-[11px] text-zinc-500">
                Click a photo to attach or remove.
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {DEFECT_LIBRARY.map((photo) => {
                  const selected = doc.failureImages.some(
                    (i) => i.url === photo.url,
                  );
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => toggleLibraryImage(photo)}
                      disabled={disabled}
                      className={`group relative overflow-hidden rounded border text-left transition-colors ${
                        selected
                          ? "border-emerald-400 ring-2 ring-emerald-200 dark:border-emerald-600 dark:ring-emerald-900"
                          : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                      }`}
                      title={photo.label}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.label}
                        className="h-16 w-full bg-white object-cover dark:bg-zinc-950"
                      />
                      <div className="truncate bg-white/80 px-1 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-300">
                        {photo.label}
                      </div>
                      {selected ? (
                        <span className="absolute right-1 top-1 rounded-full bg-emerald-600 p-0.5 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {doc.failureImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {doc.failureImages.map((img, i) => {
                const src = img.dataUrl || img.url || "";
                return (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded border border-zinc-200 dark:border-zinc-800"
                  >
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={img.name}
                        className="h-20 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-full items-center justify-center bg-zinc-100 text-[10px] text-zinc-500 dark:bg-zinc-900">
                        {img.name}
                      </div>
                    )}
                    <div className="truncate bg-white/85 px-1 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-950/85 dark:text-zinc-300">
                      {img.name}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      disabled={disabled}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </FieldShell>
    </div>
  );
}

/* =============================================================== *
 *  D3 — Immediate containment
 * =============================================================== */

function SuspectRow({
  label,
  path,
  location,
  meta,
  onField,
  onAsk,
  disabled,
}: Omit<CommonProps, "doc"> & {
  label: string;
  path: string;
  location: EightDDoc["suspect"]["inProduction"];
}) {
  return (
    <FieldShell
      path={path}
      label={label}
      meta={M(meta, path)}
      onAiDraft={() => onAsk(path, label)}
      disabled={disabled}
      compact
    >
      <div className="grid grid-cols-[80px_1fr_auto] items-center gap-2">
        <TextInput
          value={location.qty ?? ""}
          onChange={(v) => onField(path, { ...location, qty: v })}
          placeholder="Qty"
          type="number"
          disabled={disabled}
        />
        <TextInput
          value={location.reference ?? ""}
          onChange={(v) => onField(path, { ...location, reference: v })}
          placeholder="Date code / PO / charge / cavity"
          disabled={disabled}
        />
        <Checkbox
          checked={!!location.conducted}
          onChange={(v) => onField(path, { ...location, conducted: v })}
          label="Done"
          disabled={disabled}
        />
      </div>
    </FieldShell>
  );
}

export function SectionD3({
  doc,
  meta,
  onField,
  onAsk,
  disabled,
}: CommonProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Location of suspect parts
        </div>
        <div className="space-y-1.5">
          <SuspectRow
            label="In production"
            path="suspect.inProduction"
            location={doc.suspect.inProduction}
            meta={meta}
            onField={onField}
            onAsk={onAsk}
            disabled={disabled}
          />
          <SuspectRow
            label="In warehouse"
            path="suspect.inWarehouse"
            location={doc.suspect.inWarehouse}
            meta={meta}
            onField={onField}
            onAsk={onAsk}
            disabled={disabled}
          />
          <SuspectRow
            label="In transit"
            path="suspect.inTransit"
            location={doc.suspect.inTransit}
            meta={meta}
            onField={onField}
            onAsk={onAsk}
            disabled={disabled}
          />
          <SuspectRow
            label="At customer"
            path="suspect.atCustomer"
            location={doc.suspect.atCustomer}
            meta={meta}
            onField={onField}
            onAsk={onAsk}
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Immediate actions
        </div>
        <div className="space-y-1.5">
          {IMMEDIATE_ACTION_KEYS.map((k) => {
            const path = `immediate.${k}`;
            const item = doc.immediate[k];
            return (
              <FieldShell
                key={k}
                path={path}
                label={IMMEDIATE_ACTION_LABELS[k as ImmediateActionKey]}
                meta={M(meta, path)}
                onAiDraft={() =>
                  onAsk(path, IMMEDIATE_ACTION_LABELS[k as ImmediateActionKey])
                }
                disabled={disabled}
                compact
              >
                <div className="grid grid-cols-[auto_1fr_120px_1fr_80px] items-center gap-2">
                  <Checkbox
                    checked={!!item.enabled}
                    onChange={(v) =>
                      onField(path, { ...item, enabled: v })
                    }
                    label="On"
                    disabled={disabled}
                  />
                  <TextInput
                    value={item.responsible ?? ""}
                    onChange={(v) =>
                      onField(path, { ...item, responsible: v })
                    }
                    placeholder="Responsible"
                    disabled={disabled}
                  />
                  <TextInput
                    type="date"
                    value={item.dueDate ?? ""}
                    onChange={(v) => onField(path, { ...item, dueDate: v })}
                    disabled={disabled}
                  />
                  <TextInput
                    value={item.description ?? ""}
                    onChange={(v) =>
                      onField(path, { ...item, description: v })
                    }
                    placeholder="Description / result"
                    disabled={disabled}
                  />
                  <div className="flex items-center gap-1">
                    <TextInput
                      type="number"
                      value={
                        item.effectiveness != null ? String(item.effectiveness) : ""
                      }
                      onChange={(v) =>
                        onField(path, {
                          ...item,
                          effectiveness: v === "" ? undefined : Number(v),
                        })
                      }
                      placeholder="0"
                      disabled={disabled}
                    />
                    <span className="text-xs text-zinc-500">%</span>
                  </div>
                </div>
              </FieldShell>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldShell
          path="firstOkPo"
          label="First OK delivery — PO #"
          meta={M(meta, "firstOkPo")}
          onAiDraft={() => onAsk("firstOkPo", "First OK delivery PO")}
          disabled={disabled}
        >
          <TextInput
            value={doc.firstOkPo}
            onChange={(v) => onField("firstOkPo", v)}
            placeholder="PO-…"
            disabled={disabled}
          />
        </FieldShell>
        <FieldShell
          path="firstOkDate"
          label="First OK delivery — shipping date"
          meta={M(meta, "firstOkDate")}
          onAiDraft={() => onAsk("firstOkDate", "First OK delivery date")}
          disabled={disabled}
        >
          <TextInput
            type="date"
            value={doc.firstOkDate}
            onChange={(v) => onField("firstOkDate", v)}
            disabled={disabled}
          />
        </FieldShell>
      </div>
    </div>
  );
}

/* =============================================================== *
 *  D4 — Root cause (occurrence + detection blocks)
 * =============================================================== */

function CauseSubBlock({
  title,
  path,
  block,
  meta,
  onField,
  onAsk,
  disabled,
}: Omit<CommonProps, "doc"> & {
  title: string;
  path: "occurrence" | "detection";
  block: EightDDoc["occurrence"];
}) {
  const toggleCat = (cat: SixM) => {
    const current = block.categories ?? [];
    const next = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat];
    onField(path, { ...block, categories: next });
  };

  return (
    <FieldShell
      path={path}
      label={title}
      meta={M(meta, path)}
      onAiDraft={() => onAsk(path, title)}
      disabled={disabled}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {SIXM.map((c) => {
            const on = (block.categories ?? []).includes(c);
            return (
              <button
                key={c}
                type="button"
                disabled={disabled}
                onClick={() => toggleCat(c)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  on
                    ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900 dark:text-emerald-100"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
        <LongText
          value={block.potentialCause ?? ""}
          onChange={(v) => onField(path, { ...block, potentialCause: v })}
          placeholder="Potential root cause"
          rows={2}
          disabled={disabled}
        />
        <div className="space-y-1">
          {(block.whys ?? ["", "", "", "", ""]).map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] font-mono text-zinc-500">
                Why {i + 1}
              </span>
              <TextInput
                value={w}
                onChange={(v) => {
                  const next = [...(block.whys ?? ["", "", "", "", ""])];
                  next[i] = v;
                  onField(path, { ...block, whys: next });
                }}
                placeholder={`Answer to "why?" ${i + 1}`}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Confirmed root causes
          </div>
          {(block.rootCauses ?? []).map((rc, i) => (
            <div
              key={i}
              className="grid grid-cols-[32px_1fr_80px] items-center gap-2"
            >
              <span className="text-center text-[11px] font-mono text-zinc-500">
                #{i + 1}
              </span>
              <TextInput
                value={rc.text ?? ""}
                onChange={(v) => {
                  const next = [...(block.rootCauses ?? [])];
                  next[i] = { ...rc, text: v };
                  onField(path, { ...block, rootCauses: next });
                }}
                placeholder="Root cause description"
                disabled={disabled}
              />
              <div className="flex items-center gap-1">
                <TextInput
                  type="number"
                  value={rc.participation != null ? String(rc.participation) : ""}
                  onChange={(v) => {
                    const next = [...(block.rootCauses ?? [])];
                    next[i] = {
                      ...rc,
                      participation: v === "" ? undefined : Number(v),
                    };
                    onField(path, { ...block, rootCauses: next });
                  }}
                  placeholder="0"
                  disabled={disabled}
                />
                <span className="text-xs text-zinc-500">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </FieldShell>
  );
}

export function SectionD4({
  doc,
  meta,
  onField,
  onAsk,
  disabled,
}: CommonProps) {
  return (
    <div className="space-y-3">
      <CauseSubBlock
        title="Why did the failure occur?"
        path="occurrence"
        block={doc.occurrence}
        meta={meta}
        onField={onField}
        onAsk={onAsk}
        disabled={disabled}
      />
      <CauseSubBlock
        title="Why was the failure not detected?"
        path="detection"
        block={doc.detection}
        meta={meta}
        onField={onField}
        onAsk={onAsk}
        disabled={disabled}
      />
    </div>
  );
}

/* =============================================================== *
 *  D5 & D6 — planned / implemented corrective actions
 * =============================================================== */

function PlannedTable({
  title,
  path,
  rows,
  meta,
  onField,
  onAsk,
  disabled,
}: Omit<CommonProps, "doc"> & {
  title: string;
  path: "plannedOccurrence" | "plannedDetection";
  rows: EightDDoc["plannedOccurrence"];
}) {
  const add = () => onField(path, [...rows, { rootCauseNo: "" }]);
  const update = (i: number, patch: Partial<EightDDoc["plannedOccurrence"][number]>) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    onField(path, next);
  };
  const remove = (i: number) => onField(path, rows.filter((_, j) => j !== i));

  return (
    <FieldShell
      path={path}
      label={title}
      meta={M(meta, path)}
      onAiDraft={() => onAsk(path, title)}
      disabled={disabled}
    >
      <div className="space-y-1">
        <div className="grid grid-cols-[40px_1fr_1fr_120px_32px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          <div>RC #</div>
          <div>Action</div>
          <div>Responsible</div>
          <div>Due</div>
          <div />
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[40px_1fr_1fr_120px_32px] items-center gap-2"
          >
            <TextInput
              value={r.rootCauseNo ?? ""}
              onChange={(v) => update(i, { rootCauseNo: v })}
              placeholder="1"
              disabled={disabled}
            />
            <TextInput
              value={r.description ?? ""}
              onChange={(v) => update(i, { description: v })}
              placeholder="Corrective action"
              disabled={disabled}
            />
            <TextInput
              value={r.responsible ?? ""}
              onChange={(v) => update(i, { responsible: v })}
              placeholder="Owner"
              disabled={disabled}
            />
            <TextInput
              type="date"
              value={r.date ?? ""}
              onChange={(v) => update(i, { date: v })}
              disabled={disabled}
            />
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => remove(i)}
              className="h-8 w-8"
              title="Remove row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add} disabled={disabled}>
          <Plus className="h-3.5 w-3.5" />
          Add action
        </Button>
      </div>
    </FieldShell>
  );
}

export function SectionD5({
  doc,
  meta,
  onField,
  onAsk,
  disabled,
}: CommonProps) {
  return (
    <div className="space-y-3">
      <PlannedTable
        title="Corrective actions — for failure occurrence"
        path="plannedOccurrence"
        rows={doc.plannedOccurrence}
        meta={meta}
        onField={onField}
        onAsk={onAsk}
        disabled={disabled}
      />
      <PlannedTable
        title="Corrective actions — for failure detection"
        path="plannedDetection"
        rows={doc.plannedDetection}
        meta={meta}
        onField={onField}
        onAsk={onAsk}
        disabled={disabled}
      />
      <FieldShell
        path="riskOfNewFailure"
        label="Risk that these actions induce a new failure?"
        meta={M(meta, "riskOfNewFailure")}
        onAiDraft={() => onAsk("riskOfNewFailure", "Risk of new failure")}
        disabled={disabled}
      >
        <YesNoPicker
          value={doc.riskOfNewFailure}
          onChange={(v) => onField("riskOfNewFailure", v)}
          disabled={disabled}
        />
      </FieldShell>
    </div>
  );
}

function ImplementedTable({
  title,
  path,
  rows,
  meta,
  onField,
  onAsk,
  disabled,
}: Omit<CommonProps, "doc"> & {
  title: string;
  path: "implementedOccurrence" | "implementedDetection";
  rows: EightDDoc["implementedOccurrence"];
}) {
  const add = () => onField(path, [...rows, { rootCauseNo: "" }]);
  const update = (i: number, patch: Partial<EightDDoc["implementedOccurrence"][number]>) => {
    const next = [...rows];
    next[i] = { ...next[i], ...patch };
    onField(path, next);
  };
  const remove = (i: number) => onField(path, rows.filter((_, j) => j !== i));

  return (
    <FieldShell
      path={path}
      label={title}
      meta={M(meta, path)}
      onAiDraft={() => onAsk(path, title)}
      disabled={disabled}
    >
      <div className="space-y-1">
        <div className="grid grid-cols-[40px_1fr_120px_80px_1fr_32px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          <div>RC #</div>
          <div>Action</div>
          <div>Date</div>
          <div>Effect. %</div>
          <div>Note</div>
          <div />
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[40px_1fr_120px_80px_1fr_32px] items-center gap-2"
          >
            <TextInput
              value={r.rootCauseNo ?? ""}
              onChange={(v) => update(i, { rootCauseNo: v })}
              placeholder="1"
              disabled={disabled}
            />
            <TextInput
              value={r.description ?? ""}
              onChange={(v) => update(i, { description: v })}
              placeholder="Implemented action"
              disabled={disabled}
            />
            <TextInput
              type="date"
              value={r.date ?? ""}
              onChange={(v) => update(i, { date: v })}
              disabled={disabled}
            />
            <TextInput
              type="number"
              value={r.effectiveness != null ? String(r.effectiveness) : ""}
              onChange={(v) =>
                update(i, {
                  effectiveness: v === "" ? undefined : Number(v),
                })
              }
              placeholder="0"
              disabled={disabled}
            />
            <TextInput
              value={r.note ?? ""}
              onChange={(v) => update(i, { note: v })}
              placeholder="Evidence / comment"
              disabled={disabled}
            />
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => remove(i)}
              className="h-8 w-8"
              title="Remove row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add} disabled={disabled}>
          <Plus className="h-3.5 w-3.5" />
          Add action
        </Button>
      </div>
    </FieldShell>
  );
}

export function SectionD6({
  doc,
  meta,
  onField,
  onAsk,
  disabled,
}: CommonProps) {
  return (
    <div className="space-y-3">
      <ImplementedTable
        title="Implemented — for failure occurrence"
        path="implementedOccurrence"
        rows={doc.implementedOccurrence}
        meta={meta}
        onField={onField}
        onAsk={onAsk}
        disabled={disabled}
      />
      <ImplementedTable
        title="Implemented — for failure detection"
        path="implementedDetection"
        rows={doc.implementedDetection}
        meta={meta}
        onField={onField}
        onAsk={onAsk}
        disabled={disabled}
      />
    </div>
  );
}

/* =============================================================== *
 *  D7 — Preventive + risk assessment
 * =============================================================== */

export function SectionD7({
  doc,
  meta,
  onField,
  onAsk,
  disabled,
}: CommonProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="grid grid-cols-[1fr_120px_1fr_120px_120px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          <div>Update / modification</div>
          <div>Applicable?</div>
          <div>Responsible</div>
          <div>Due</div>
          <div>End date</div>
        </div>
        {PREVENTIVE_KEYS.map((k) => {
          const path = `preventive.${k}`;
          const item = doc.preventive[k];
          return (
            <FieldShell
              key={k}
              path={path}
              label={PREVENTIVE_LABELS[k as PreventiveKey]}
              meta={M(meta, path)}
              onAiDraft={() =>
                onAsk(path, PREVENTIVE_LABELS[k as PreventiveKey])
              }
              disabled={disabled}
              compact
            >
              <div className="grid grid-cols-[1fr_120px_1fr_120px_120px] items-center gap-2">
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  {PREVENTIVE_LABELS[k as PreventiveKey]}
                </div>
                <Select
                  value={item.applicable ?? ""}
                  onChange={(v) =>
                    onField(path, {
                      ...item,
                      applicable: v as "yes" | "no" | "",
                    })
                  }
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                  disabled={disabled}
                />
                <TextInput
                  value={item.responsible ?? ""}
                  onChange={(v) => onField(path, { ...item, responsible: v })}
                  placeholder="Owner"
                  disabled={disabled}
                />
                <TextInput
                  type="date"
                  value={item.dueDate ?? ""}
                  onChange={(v) => onField(path, { ...item, dueDate: v })}
                  disabled={disabled}
                />
                <TextInput
                  type="date"
                  value={item.endDate ?? ""}
                  onChange={(v) => onField(path, { ...item, endDate: v })}
                  disabled={disabled}
                />
              </div>
            </FieldShell>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldShell
          path="transferredToSimilar"
          label="Actions transferred to similar parts/processes?"
          meta={M(meta, "transferredToSimilar")}
          onAiDraft={() =>
            onAsk("transferredToSimilar", "Transferred to similar processes")
          }
          disabled={disabled}
        >
          <YesNoPicker
            value={doc.transferredToSimilar}
            onChange={(v) => onField("transferredToSimilar", v)}
            disabled={disabled}
          />
        </FieldShell>
        <FieldShell
          path="otherPartsAffected"
          label="Other parts affected by this failure?"
          meta={M(meta, "otherPartsAffected")}
          onAiDraft={() =>
            onAsk("otherPartsAffected", "Other parts affected")
          }
          disabled={disabled}
        >
          <YesNoPicker
            value={doc.otherPartsAffected}
            onChange={(v) => onField("otherPartsAffected", v)}
            disabled={disabled}
          />
        </FieldShell>
      </div>
      {doc.otherPartsAffected === "yes" ? (
        <FieldShell
          path="otherPartsWhich"
          label="Which parts"
          meta={M(meta, "otherPartsWhich")}
          onAiDraft={() => onAsk("otherPartsWhich", "Other parts affected list")}
          disabled={disabled}
        >
          <TextInput
            value={doc.otherPartsWhich}
            onChange={(v) => onField("otherPartsWhich", v)}
            placeholder="Part numbers / articles"
            disabled={disabled}
          />
        </FieldShell>
      ) : null}
    </div>
  );
}

/* =============================================================== *
 *  D8 — Closure
 * =============================================================== */

export function SectionD8({
  doc,
  meta,
  onField,
  onAsk,
  disabled,
}: CommonProps) {
  return (
    <FieldShell
      path="appreciation"
      label="Team appreciation / closing note"
      meta={M(meta, "appreciation")}
      onAiDraft={() => onAsk("appreciation", "Team appreciation")}
      disabled={disabled}
    >
      <LongText
        value={doc.appreciation}
        onChange={(v) => onField("appreciation", v)}
        placeholder="Recognize the team's work on this 8D."
        rows={3}
        disabled={disabled}
      />
    </FieldShell>
  );
}
