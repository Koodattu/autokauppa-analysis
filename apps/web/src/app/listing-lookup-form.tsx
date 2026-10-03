export function ListingLookupForm({ value = "", invalid = false }: { value?: string; invalid?: boolean }) {
  return <form className="lookup-form" action="/lookup">
    <label>
      <span>Nettiauto URL or listing ID</span>
      <input name="listing" required maxLength={300} defaultValue={value}
        aria-invalid={invalid || undefined} aria-describedby={invalid ? "lookup-guidance" : undefined}
        placeholder="https://www.nettiauto.com/…" />
    </label>
    <button type="submit">Find listing</button>
  </form>;
}
