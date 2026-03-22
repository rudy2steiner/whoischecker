'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { Loader2, Check, X, AlertCircle, ChevronDown, Info, Settings, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DomainStatus {
  tld: string;
  status: 'checking' | 'available' | 'unavailable' | 'error' | null;
  registrar?: string;
  createdDate?: string;
  expiresDate?: string;
  error?: string;
  whoisData?: {
    nameServers?: string[];
    rawText?: string;
    registrant?: any;
    admin?: any;
    tech?: any;
  };
}

const DEFAULT_TLDS = [
  // Generic TLDs
  'com', 'net', 'org', 'io', 'co', 
  // Tech TLDs
  'dev', 'app', 'ai',
  // Business TLDs
  'biz',
  // Other Popular TLDs
  'info', 'me', 'xyz', 'online'
] as const;

const REGISTRARS = [
  { 
    name: 'Dynadot',
    url: (domain: string) => `https://www.dynadot.com/domain/search?domain=${domain}`,
    logo: '/dynadot.ico'
  },
  {
      name: 'GoDaddy',
      url: (domain: string) => `https://www.godaddy.com/domainsearch/find?domainToCheck=${domain}`,
      logo: '/godadday.png'
  }
];

export function PhotoMaker() {
  const t = useTranslations();
  const { toast } = useToast();
  const [domain, setDomain] = useState('');
  const [customTld, setCustomTld] = useState('');
  const [tlds, setTlds] = useState<string[]>([...DEFAULT_TLDS]);
  const [domainStatuses, setDomainStatuses] = useState<DomainStatus[]>(
    DEFAULT_TLDS.map(tld => ({ tld, status: null }))
  );
  const [isChecking, setIsChecking] = useState(false);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const addTlds = () => {
    if (!customTld) return;
    
    const newTlds = customTld
      .toLowerCase()
      .split(/[\s,]+/)
      .map(tld => tld.trim().replace(/[^a-z0-9-]/g, ''))
      .filter(tld => tld && !tlds.includes(tld));

    if (newTlds.length) {
      const updatedTlds = [...tlds, ...newTlds];
      setTlds(updatedTlds);
      setDomainStatuses(prev => [
        ...prev,
        ...newTlds.map(tld => ({ tld, status: null }))
      ]);
      setCustomTld('');
    }
  };

  const removeTld = (tldToRemove: string) => {
    setTlds(tlds.filter(tld => tld !== tldToRemove));
    setDomainStatuses(prev => prev.filter(status => status.tld !== tldToRemove));
  };

  const clearAllTlds = () => {
    setTlds([]);
    setDomainStatuses([]);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  /** WHOIS/RDAP + fallbacks can be slow; .me / .xyz often need extra time (thin WHOIS, RDAP hops). */
  const DOMAIN_CHECK_TIMEOUT_MS = 120_000;
  const DOMAIN_CHECK_TIMEOUT_SLOW_TLDS_MS = 240_000;
  const SLOW_CLIENT_TLDS = new Set(['me', 'xyz']);

  const getDomainCheckTimeoutMs = (tld: string) =>
    SLOW_CLIENT_TLDS.has(tld.toLowerCase())
      ? DOMAIN_CHECK_TIMEOUT_SLOW_TLDS_MS
      : DOMAIN_CHECK_TIMEOUT_MS;

  const checkDomain = async (domainName: string, tld: string) => {
    const timeoutMs = getDomainCheckTimeoutMs(tld);
    try {
      const response = await fetch('/api/domain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain: domainName, tld }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as { error?: string }).error || t('common.domain.error')
        );
      }

      return await response.json();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      const isTimeout =
        message.includes('aborted') ||
        (error instanceof DOMException && error.name === 'TimeoutError');
      console.error('Error checking domain:', error);
      return {
        tld,
        status: 'error' as const,
        error: isTimeout
          ? `${t('common.error.timeout')} (${timeoutMs / 1000}s)`
          : message,
      };
    }
  };

  const handleCheck = async () => {
    if (!domain || isChecking) return;

    // Check if the input contains a dot to determine if it includes a TLD
    const parts = domain.toLowerCase().split('.');
    let domainName: string;
    let specificTld: string | null = null;

    if (parts.length > 1) {
      // If input includes TLD (e.g., "example.com")
      domainName = parts.slice(0, -1).join('').replace(/[^a-z0-9-]/g, '');
      specificTld = parts[parts.length - 1].replace(/[^a-z0-9-]/g, '');
    } else {
      // If input is just a domain name
      domainName = domain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    }

    if (!domainName) {
      toast({
        title: t('common.error.title'),
        description: t('common.domain.invalidDomain'),
        variant: 'destructive',
      });
      return;
    }

    setIsChecking(true);
    
    try {
      if (specificTld) {
        // Check only the specific TLD
        const result = await checkDomain(domainName, specificTld);
        setDomainStatuses([result]);
      } else {
        // Check all configured TLDs in parallel; apply each result as soon as it returns so slow TLDs don't block fast ones.
        setDomainStatuses((prev) =>
          prev.map((item) => ({ ...item, status: 'checking' as const }))
        );
        await Promise.allSettled(
          tlds.map((tld) =>
            checkDomain(domainName, tld).then((result) => {
              setDomainStatuses((prev) =>
                prev.map((item) =>
                  item.tld === tld ? { ...item, ...result } : item
                )
              );
            })
          )
        );
      }
    } catch (error) {
      toast({
        title: t('common.error.title'),
        description: t('common.domain.checkFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8" id="photo-maker">
      <Card className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 sm:gap-0">
          <h2 className="text-2xl font-bold">{t('common.domain.title')}</h2>
          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">TLD customize</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>TLD Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Add TLDs (comma or space separated)
                    </label>
                    <textarea
                      placeholder="Example: dev app tech ai"
                      value={customTld}
                      onChange={(e) => setCustomTld(e.target.value)}
                      className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          e.preventDefault();
                          addTlds();
                        }
                      }}
                    />
                  </div>
                  <Button 
                    onClick={addTlds}
                    disabled={!customTld}
                    className="w-full"
                  >
                    Add TLDs
                  </Button>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">
                      Current TLDs
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearAllTlds}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear All
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto p-2 border rounded-md">
                    {tlds.map((tld) => (
                      <div
                        key={tld}
                        className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm"
                      >
                        .{tld}
                        <button
                          onClick={() => removeTld(tld)}
                          className="text-muted-foreground hover:text-foreground ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setTlds([...DEFAULT_TLDS]);
                    setDomainStatuses(DEFAULT_TLDS.map(tld => ({ tld, status: null })));
                  }}
                >
                  Reset to Default TLDs
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Search Input */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Input
            type="text"
            placeholder={t('common.domain.placeholder')}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
          />
          <Button 
            onClick={handleCheck} 
            disabled={!domain.trim() || isChecking}
            className="w-full sm:w-auto"
          >
            {isChecking ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {isChecking ? t('common.domain.checking') : t('common.domain.check')}
          </Button>
        </div>

        {/* Results */}
        <div className="space-y-3">
          {domain.trim() && domainStatuses.map((item) => {
            const parts = domain.toLowerCase().split('.');
            const domainName = parts.length > 1 
              ? parts.slice(0, -1).join('').replace(/[^a-z0-9-]/g, '')
              : domain.toLowerCase().replace(/[^a-z0-9-]/g, '');
            
            const fullDomain = `${domainName}.${item.tld}`;
            const itemKey = `${domainName}-${item.tld}`;
            
            return (
              <Collapsible
                key={itemKey}
                open={openItems[itemKey]}
                onOpenChange={(isOpen) => {
                  setOpenItems(prev => ({
                    ...prev,
                    [itemKey]: isOpen
                  }));
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-[2fr,3fr,auto] items-center gap-4 p-3 bg-muted/30 rounded-lg">
                  <div className="text-base sm:text-lg font-medium truncate">
                    {fullDomain}
                  </div>
                  
                  <div className="hidden sm:flex items-center gap-4">
                    {item.status === 'unavailable' && (
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        Created: {formatDate(item.createdDate)} • Expires: {formatDate(item.expiresDate)}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end gap-4 whitespace-nowrap">
                    {item.status === 'checking' && (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    )}
                    
                    {item.status === 'available' && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center text-green-500">
                          <span>{t('common.domain.available')}</span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="flex items-center gap-2">
                              <div className="relative w-5 h-5 flex-shrink-0">
                                <Image
                                  src={REGISTRARS[0].logo}
                                  alt={REGISTRARS[0].name}
                                  width={20}
                                  height={20}
                                  className="object-contain"
                                  unoptimized
                                />
                              </div>
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[100px]">
                            {REGISTRARS.map((registrar) => (
                              <DropdownMenuItem key={registrar.name} className="p-2">
                                <a 
                                  href={registrar.url(fullDomain)} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="w-full flex items-center gap-3"
                                >
                                  <div className="relative w-6 h-6 flex-shrink-0">
                                    <Image
                                      src={registrar.logo}
                                      alt={registrar.name}
                                      width={24}
                                      height={24}
                                      className="object-contain"
                                      unoptimized
                                    />
                                  </div>
                                  <span className="flex-1 truncate"> {registrar.name}</span>
                                </a>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                    
                    {item.status === 'unavailable' && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center text-red-500">
                          <span>{t('common.domain.unavailable')}</span>
                        </div>
                        {item.registrar && (
                          <>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 px-2">
                                Whois
                                <ChevronDown className={`ml-1 h-4 w-4 transition-transform duration-200 ${
                                  openItems[itemKey] ? 'rotate-180' : ''
                                }`} />
                              </Button>
                            </CollapsibleTrigger>
                          </>
                        )}
                      </div>
                    )}

                    {item.status === 'error' && (
                      <div className="flex items-center gap-2 text-yellow-500">
                        <AlertCircle className="h-5 w-4" />
                        <span>{t('common.domain.error')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {item.status === 'unavailable' && item.whoisData && (
                  <CollapsibleContent>
                    <div className="px-3 py-2">
                      <div className="space-y-3 bg-muted/20 rounded-lg p-3 text-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <span className="text-muted-foreground block text-xs">Registrar</span>
                            <span className="font-medium">{item.registrar}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Created</span>
                            <span className="font-medium">{formatDate(item.createdDate)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Expires</span>
                            <span className="font-medium">{formatDate(item.expiresDate)}</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Name Servers</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {item.whoisData.nameServers?.map((ns, index) => (
                              <div key={`${itemKey}-ns-${index}`} className="font-mono text-xs bg-muted/30 px-2 py-1 rounded truncate">
                                {ns}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-muted-foreground block text-xs mb-1">Raw WHOIS Data</span>
                          <pre className="text-xs bg-muted/30 p-2 rounded max-h-[120px] overflow-auto whitespace-pre-wrap">
                            {item.whoisData.rawText}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                )}
              </Collapsible>
            );
          })}
        </div>
      </Card>
    </div>
  );
}