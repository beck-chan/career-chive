import type { Metadata, Viewport } from "next";

const description =
  "Gain oversight over your professional accomplishments and experiences at work.";

const lightIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="#4f263d" transform="translate(0 18.1) scale(0.0185 -0.0185)"><path d="M579 458 567 327H548Q527 401 492.5 436.5Q458 472 392 472Q319 472 288.5 421Q258 370 258 270Q258 187 271 136Q284 85 318 58.5Q352 32 414 32Q461 32 500 45.5Q539 59 577 85L590 66Q543 30 484.5 9Q426 -12 348 -12Q207 -12 128.5 53Q50 118 50 249Q50 373 132 435.5Q214 498 374 498Q499 498 579 458Z"/></g><g fill="#4f263d" transform="translate(20.16 22.9) scale(0.0185 -0.0185)"><path d="M579 458 567 327H548Q527 401 492.5 436.5Q458 472 392 472Q319 472 288.5 421Q258 370 258 270Q258 187 271 136Q284 85 318 58.5Q352 32 414 32Q461 32 500 45.5Q539 59 577 85L590 66Q543 30 484.5 9Q426 -12 348 -12Q207 -12 128.5 53Q50 118 50 249Q50 373 132 435.5Q214 498 374 498Q499 498 579 458Z"/></g><path fill="#61683b" d="M 9.05 27.6 L 12.76 27.6 L 22.96 4.4 L 19.25 4.4 Z"/></svg>`;

const darkIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="#ebe6ed" transform="translate(0 18.1) scale(0.0185 -0.0185)"><path d="M579 458 567 327H548Q527 401 492.5 436.5Q458 472 392 472Q319 472 288.5 421Q258 370 258 270Q258 187 271 136Q284 85 318 58.5Q352 32 414 32Q461 32 500 45.5Q539 59 577 85L590 66Q543 30 484.5 9Q426 -12 348 -12Q207 -12 128.5 53Q50 118 50 249Q50 373 132 435.5Q214 498 374 498Q499 498 579 458Z"/></g><g fill="#ebe6ed" transform="translate(20.16 22.9) scale(0.0185 -0.0185)"><path d="M579 458 567 327H548Q527 401 492.5 436.5Q458 472 392 472Q319 472 288.5 421Q258 370 258 270Q258 187 271 136Q284 85 318 58.5Q352 32 414 32Q461 32 500 45.5Q539 59 577 85L590 66Q543 30 484.5 9Q426 -12 348 -12Q207 -12 128.5 53Q50 118 50 249Q50 373 132 435.5Q214 498 374 498Q499 498 579 458Z"/></g><path fill="#c5cba3" d="M 9.05 27.6 L 12.76 27.6 L 22.96 4.4 L 19.25 4.4 Z"/></svg>`;

function svgIcon(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const careerchiveMetadata: Metadata = {
  title: "CareerChive",
  description,
  icons: {
    icon: [
      { url: svgIcon(lightIcon), type: "image/svg+xml" },
      {
        url: svgIcon(darkIcon),
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export const careerchiveOverviewMetadata: Metadata = {
  title: "Overview",
  description,
};

export const careerchiveSearchMetadata: Metadata = {
  title: "Search",
  description,
};

export const careerchiveOrganizationsMetadata: Metadata = {
  title: "Organizations",
  description,
};

export const careerchiveLoginMetadata: Metadata = {
  title: "Log In",
  description,
};

export const careerchiveNotFoundMetadata: Metadata = {
  title: "404",
  description,
  robots: { index: false, follow: false },
};

export const careerchiveViewport: Viewport = {
  colorScheme: "light dark",
};
