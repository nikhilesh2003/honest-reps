import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join me on Honest Reps",
  description:
    "Compare honest gym and cardio effort fairly against your own history.",
  openGraph: {
    type: "website",
    siteName: "Honest Reps",
    title: "Join me on Honest Reps",
    description:
      "Compare honest gym and cardio effort fairly against your own history.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Honest Reps Friend Invite",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Join me on Honest Reps",
    description:
      "Compare honest gym and cardio effort fairly against your own history.",
    images: ["/og-image.png"],
  },
};

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
