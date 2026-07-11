import type { Metadata } from "next";
import { Noto_Serif_Bengali } from "next/font/google";
import "./globals.css";

const notoSerifBengali = Noto_Serif_Bengali({
  variable: "--font-noto-bengali",
  subsets: ["bengali"],
  weight: ["400", "700"],
  display: "optional",
});

export const metadata: Metadata = {
  title: "সাংস্কৃতিক সংসদ, ঢাকা বিশ্ববিদ্যালয় | সঙ্গীত ও বাদ্যযন্ত্র কোর্স ভর্তি",
  description: "সাংস্কৃতিক সংসদ, ঢাকা বিশ্ববিদ্যালয় — সঙ্গীত ও বাদ্যযন্ত্র কোর্সে ভর্তি ফরম। বাঁশি, গিটার, ভায়োলিন, কণ্ঠসঙ্গীত, ইউকুলেলে, দোতারা কোর্সে রেজিস্ট্রেশন করুন।",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "সাংস্কৃতিক সংসদ, ঢাকা বিশ্ববিদ্যালয়",
    description: "সঙ্গীত ও বাদ্যযন্ত্র কোর্স ভর্তি ফরম। বাঁশি, গিটার, ভায়োলিন, কণ্ঠসঙ্গীত, ইউকুলেলে, দোতারা কোর্সে রেজিস্ট্রেশন করুন।",
    siteName: "সাংস্কৃতিক সংসদ",
    locale: "bn_BD",
    type: "website",
    images: [{ url: "/logo.png", width: 512, height: 512 }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="bn"
      className={`${notoSerifBengali.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans">{children}</body>
    </html>
  );
}
