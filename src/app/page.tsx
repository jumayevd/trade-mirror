/*
 * Mirror Trade Analytics on its own: the CBU Analytics portal's trade section,
 * under the same /savdo/ addresses so its files are the portal's, unchanged.
 * The root address has nothing of its own. vercel.json redirects it; this page
 * is what a host without that redirect serves, and it forwards the reader.
 */
export const metadata = { title: "Mirror Trade Analytics" };

export default function RootPage() {
  return (
    <>
      <meta httpEquiv="refresh" content="0; url=/savdo/" />
      <p className="p-8 fs-14">
        <a href="/savdo/" className="font-medium text-[var(--color-primary)] hover:underline">Mirror Trade Analytics →</a>
      </p>
    </>
  );
}
