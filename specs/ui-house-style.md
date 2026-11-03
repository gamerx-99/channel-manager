# Back-office house style

Use the shared rules from `client/src/index.css` for every back-office page.

```tsx
<section className="page-intro intro-split"><div><div className="eyebrow">{t("page.eyebrow")}</div><h1>{t("page.title")}<span className="title-mark">.</span></h1><p className="lede">{t("page.lede")}</p></div></section>
<section className="panel"><div className="panel-heading"><div><div className="eyebrow">{t("page.section")}</div><h2>{t("page.heading")}</h2></div><span className="status-pill live">{t("page.status")}</span></div></section>
<form className="panel"><div className="panel-heading"><h2>{t("page.formTitle")}</h2></div><div className="form-grid"><label>{t("page.name")}<input /></label><label className="form-span-two">{t("page.notes")}<textarea /></label></div><div className="form-submit"><button className="button button-primary">{t("common.save")}</button></div></form>
<p className="field-help">{t("page.help")}</p><p className="form-error" role="alert">{t("page.error")}</p>
<section className="panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>{t("page.name")}</th></tr></thead><tbody><tr><td>{t("page.value")}</td></tr></tbody></table></div></section>
<section className="panel empty-state">{t("page.empty")}</section>
<div className="summary-strip"><div><span>{t("page.metric")}</span><strong>12</strong></div></div>
<button className="button button-primary">{t("common.save")}</button><button className="button button-quiet button-small">{t("common.cancel")}</button>
```

- Every page starts with `page-intro`.
- Every content block is a `panel` with a `panel-heading`.
- Every form uses `form-grid`; each `<label>` wraps its control.
- Record collections use `data-table` inside `table-wrap`, or a list inside a panel.
- Empty states use `empty-state`.
- Status words use `status-pill` and an existing status variant.
- All user-facing copy goes through i18n; do not add raw English UI strings.
- At 375px, the page must not scroll horizontally, forms stack, tables scroll within `table-wrap`, and buttons retain a usable full-size target.
