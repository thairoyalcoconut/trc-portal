"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { sanitizeMemoHtml } from "@/lib/memoRichText";

export type CreateMemorandumInput = {
  id: string; // generated client-side so uploaded images can be namespaced
  // under it before the row exists.
  memo_date: string;
  subject: string;
  to_recipient: string;
  details: string;
  recorded_by: string;
  reviewed_by: string;
  approved_by: string;
  image_paths: string[];
};

// Called directly from MemorandumForm (a client component) rather than as a
// native <form action>, because images are uploaded straight from the
// browser to Supabase Storage first — this only ever receives small text
// fields plus the resulting storage paths. Returns {ok, id} / {ok, error}
// instead of throwing/redirecting, since redirect() doesn't propagate
// correctly when a server action is awaited directly like this (only when
// used as a native form action) — the caller navigates itself on success.
export async function createMemorandum(
  input: CreateMemorandumInput
  ): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Not signed in" };

const field = (v: string) => (v.trim().length > 0 ? v.trim() : null);

const subject = field(input.subject);
  const rawDetails = field(input.details);
  if (!subject) return { ok: false, error: "Subject is required" };
  if (!rawDetails) return { ok: false, error: "Details is required" };
  // Security boundary: `details` comes from RichTextEditor (a contentEditable
// div), which normally only ever produces our own small tag/style set, but
// the client can't be trusted — re-sanitize here before this HTML is
// stored and later rendered with dangerouslySetInnerHTML.
const details = sanitizeMemoHtml(rawDetails);
  if (!details) return { ok: false, error: "Details is required" };

const supabase = createClient();
  const { data: memo, error } = await supabase
  .from("memorandums")
  .insert({
    id: input.id,
    memo_date: field(input.memo_date) || new Date().toISOString().slice(0, 10),
    subject,
    to_recipient: field(input.to_recipient),
    details,
    recorded_by: field(input.recorded_by) || profile.id,
    reviewed_by: field(input.reviewed_by),
    approved_by: field(input.approved_by),
    created_by: profile.id,
    image_paths: input.image_paths,
  })
  .select("id")
  .single();

if (error) return { ok: false, error: error.message };

revalidatePath("/memorandum");
  return { ok: true, id: memo.id };
}

export type UpdateMemorandumInput = {
  id: string;
  memo_date: string;
  subject: string;
  to_recipient: string;
  details: string;
  recorded_by: string;
  reviewed_by: string;
  approved_by: string;
};

// Lets an admin/manager go back and correct a memo after it was saved —
// fix a typo in the subject/details, adjust a signer, etc. Gated to the
// same admin/manager tier as decideMemorandum/deleteMemorandum below,
// since a memorandum is a signed-off record once created and editing it
// shouldn't be open to every signed-in user. Attachments (image_paths)
// are intentionally left untouched here — this form doesn't manage them
// yet, so a memo's existing images survive an edit unchanged.
export async function updateMemorandum(
  input: UpdateMemorandumInput
  ): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Not signed in" };
  if (profile.role !== "admin" && profile.role !== "manager") {
    return { ok: false, error: "Only managers or admins can edit a memorandum" };
  }
  
  const field = (v: string) => (v.trim().length > 0 ? v.trim() : null);
  
  const subject = field(input.subject);
  const rawDetails = field(input.details);
  if (!subject) return { ok: false, error: "Subject is required" };
  if (!rawDetails) return { ok: false, error: "Details is required" };
  // Same server-side re-sanitize boundary as createMemorandum above.
  const details = sanitizeMemoHtml(rawDetails);
  if (!details) return { ok: false, error: "Details is required" };
  
  const supabase = createClient();
  const { error } = await supabase
    .from("memorandums")
    .update({
      memo_date: field(input.memo_date) || new Date().toISOString().slice(0, 10),
      subject,
      to_recipient: field(input.to_recipient),
      details,
      recorded_by: field(input.recorded_by) || profile.id,
      reviewed_by: field(input.reviewed_by),
      approved_by: field(input.approved_by),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  
  if (error) return { ok: false, error: error.message };
  
  revalidatePath("/memorandum");
  revalidatePath(`/memorandum/${input.id}`);
  return { ok: true };
}

export async function decideMemorandum(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not signed in");
  if (profile.role !== "admin" && profile.role !== "manager") {
    throw new Error("Only managers or admins can approve/reject a memorandum");
  }

const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");

const supabase = createClient();
  const { error } = await supabase
  .from("memorandums")
  .update({ status, updated_at: new Date().toISOString() })
  .eq("id", id);
  if (error) throw new Error(error.message);

revalidatePath("/memorandum");
  revalidatePath(`/memorandum/${id}`);
}

export async function deleteMemorandum(formData: FormData) {
  const id = String(formData.get("id") || "");
  const supabase = createClient();
  const { error } = await supabase.from("memorandums").delete().eq("id", id);
  if (error) throw new Error(error.message);

revalidatePath("/memorandum");
  redirect("/memorandum");
}
