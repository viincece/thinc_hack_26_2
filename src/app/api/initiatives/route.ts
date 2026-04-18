import { NextResponse } from "next/server";
import { manex } from "@/lib/manex";

type NewInitiative = {
  product_id: string;
  defect_id?: string;
  action_type: "containment" | "corrective" | "preventive" | "investigation";
  owner_user_id: string;
  title: string;
  details: string;
  due_date?: string;
};

function newActionId(): string {
  const rand = Math.floor(Math.random() * 1e5)
    .toString()
    .padStart(5, "0");
  return `PA-${Date.now().toString().slice(-5)}${rand}`.slice(0, 14);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as NewInitiative | null;
  if (!body?.product_id || !body?.title || !body?.action_type) {
    return NextResponse.json(
      { error: "product_id, title, action_type required" },
      { status: 400 },
    );
  }

  const row = {
    action_id: newActionId(),
    product_id: body.product_id,
    ts: new Date().toISOString(),
    action_type: body.action_type,
    status: "open",
    user_id: body.owner_user_id ?? "unassigned",
    section_id: null,
    comments: `${body.title}\n\n${body.details}${
      body.due_date ? `\n\nDue: ${body.due_date}` : ""
    }`,
    defect_id: body.defect_id ?? null,
  };

  try {
    const created = await manex<unknown[]>("/product_action", {}, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    return NextResponse.json({ ok: true, row: created[0] ?? row });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
