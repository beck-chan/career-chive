import { Suspense, type ReactNode } from "react";
import { Chonburi, Instrument_Serif, Jost } from "next/font/google";
import { loadArchive } from "../app/actions/archive";
import { AppChrome } from "../components/AppChrome";
import { DemoProvider } from "../lib/demo";
import { APP_ROOT_CLASS, APP_ROOT_ID, THEME_BOOT_SCRIPT } from "../lib/theme";

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const chonburi = Chonburi({
  variable: "--font-chonburi",
  subsets: ["latin"],
  weight: "400",
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

async function CareerChiveFrame({ children }: { children: ReactNode }) {
  const archive = await loadArchive({ ensure: true });
  return (
    <DemoProvider
      initialData={archive.data}
      initialStatus={
        !archive.ok && "connection" in archive && archive.connection
          ? "error"
          : !archive.ok && "signedOut" in archive && archive.signedOut
            ? "signedOut"
            : "ready"
      }
    >
      <AppChrome>{children}</AppChrome>
    </DemoProvider>
  );
}

export function CareerChiveLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <script
        id="careerchive-theme-boot"
        dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
      />
      <div
        id={APP_ROOT_ID}
        className={`${APP_ROOT_CLASS} ${jost.variable} ${chonburi.variable} ${instrument.variable}`}
        data-theme="light"
        suppressHydrationWarning
      >
        <Suspense fallback={null}>
          <CareerChiveFrame>{children}</CareerChiveFrame>
        </Suspense>
      </div>
    </>
  );
}
