export function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="aurora-blob animate-float-slow"
        style={{
          top: "-12%",
          left: "4%",
          width: "520px",
          height: "520px",
          background: "radial-gradient(circle, oklch(0.6 0.22 290 / 0.5), transparent 70%)",
        }}
      />
      <div
        className="aurora-blob animate-float-slower"
        style={{
          top: "6%",
          right: "-8%",
          width: "620px",
          height: "620px",
          background: "radial-gradient(circle, oklch(0.62 0.16 235 / 0.45), transparent 70%)",
        }}
      />
      <div
        className="aurora-blob animate-float-slow"
        style={{
          top: "55%",
          left: "28%",
          width: "460px",
          height: "460px",
          background: "radial-gradient(circle, oklch(0.6 0.2 330 / 0.3), transparent 70%)",
        }}
      />
      <div className="absolute inset-0 grid-bg opacity-60" />
    </div>
  );
}
