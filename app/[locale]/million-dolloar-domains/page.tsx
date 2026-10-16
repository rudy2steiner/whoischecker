import { redirect } from 'next/navigation';

export default function LegacyMillionDollarDomainsPage({ params: { locale } }: { params: { locale: string } }) {
  redirect(`/${locale}/million-dollar-domains`);
}
