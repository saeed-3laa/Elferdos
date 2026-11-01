"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="container error-page"><h1>تعذّر عرض الصفحة</h1><p>حاول تحميلها مرة أخرى.</p><button className="button" onClick={reset}>إعادة المحاولة</button></main>;
}
