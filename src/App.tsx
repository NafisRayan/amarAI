import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  CircleHelp,
  Copy,
  Check,
  Loader2,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  PenSquare,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Provider = "openai-compatible" | "gemini" | "huggingface";

type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Conversation = {
  id: string;
  title: string;
  provider: Provider;
  model: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
};

type ConversationDetail = Omit<Conversation, "preview"> & {
  messages: Message[];
};

type ProviderConfig = {
  provider: Provider;
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
};

type HealthState = "checking" | "online" | "offline";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "http://localhost:8787";

const PROVIDERS: ProviderConfig[] = [
  {
    provider: "openai-compatible",
    label: "OpenAI Compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  {
    provider: "gemini",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-1.5-flash",
  },
  {
    provider: "huggingface",
    label: "Hugging Face",
    defaultBaseUrl: "https://router.huggingface.co/v1",
    defaultModel: "meta-llama/Llama-3.1-8B-Instruct",
  },
];

const makeTempId = () => `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const formatConversationTime = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

type StreamHandlers = {
  onToken: (payload: { token: string; full: string }) => void;
  onDone: (payload: { assistantMessage: Message }) => void;
  onError: (payload: { message: string }) => void;
};

const parseSseChunk = (raw: string) => {
  const lines = raw.split("\n");
  let event = "message";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }

  if (!data) return null;

  try {
    return { event, payload: JSON.parse(data) as unknown };
  } catch {
    return null;
  }
};

const streamChat = async (
  body: Record<string, unknown>,
  handlers: StreamHandlers
) => {
  const response = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Failed to connect to chat API.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const parsed = parseSseChunk(block);
      if (!parsed) continue;

      if (parsed.event === "token") {
        handlers.onToken(parsed.payload as { token: string; full: string });
      }

      if (parsed.event === "done") {
        handlers.onDone(parsed.payload as { assistantMessage: Message });
      }

      if (parsed.event === "error") {
        handlers.onError(parsed.payload as { message: string });
      }
    }
  }
};

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [healthState, setHealthState] = useState<HealthState>("checking");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("openai-compatible");
  const [model, setModel] = useState(PROVIDERS[0].defaultModel);
  const [baseUrl, setBaseUrl] = useState(PROVIDERS[0].defaultBaseUrl);
  const [apiKey, setApiKey] = useState("");

  const loadProviderSettings = async () => {
    const response = await fetch(`${API_BASE}/api/settings/provider`);
    if (!response.ok) {
      throw new Error("Could not load provider settings.");
    }

    const payload = (await response.json()) as {
      settings: {
        provider: Provider;
        model: string;
        baseUrl: string;
        apiKey: string;
      };
    };

    setProvider(payload.settings.provider);
    setModel(payload.settings.model);
    setBaseUrl(payload.settings.baseUrl);
    setApiKey(payload.settings.apiKey);
  };

  const checkBackendHealth = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/health`);
      if (!response.ok) {
        throw new Error("Health check failed.");
      }
      setHealthState("online");
    } catch {
      setHealthState("offline");
    }
  };

  const saveProviderSettings = async (next?: {
    provider?: Provider;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
  }) => {
    const body = {
      provider: next?.provider ?? provider,
      model: next?.model ?? model,
      baseUrl: next?.baseUrl ?? baseUrl,
      apiKey: next?.apiKey ?? apiKey,
    };

    setIsSavingSettings(true);
    try {
      const response = await fetch(`${API_BASE}/api/settings/provider`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Could not save provider settings.");
      }
    } finally {
      setIsSavingSettings(false);
    }
  };

  const loadConversations = async () => {
    const response = await fetch(`${API_BASE}/api/conversations`);
    if (!response.ok) {
      throw new Error("Could not load conversations.");
    }

    const payload = (await response.json()) as { conversations: Conversation[] };
    setConversations(payload.conversations);

    if (!payload.conversations.length) {
      setActiveConversation(null);
      return;
    }

    const hasActive = activeConversation
      ? payload.conversations.some((item) => item.id === activeConversation.id)
      : false;

    const selectedId = hasActive ? activeConversation?.id : payload.conversations[0].id;
    if (selectedId) {
      await loadConversation(selectedId);
    }
  };

  const loadConversation = async (id: string) => {
    const response = await fetch(`${API_BASE}/api/conversations/${id}`);
    if (!response.ok) {
      throw new Error("Could not load selected conversation.");
    }

    const payload = (await response.json()) as { conversation: ConversationDetail };
    setActiveConversation(payload.conversation);
  };

  const createConversation = async () => {
    setIsCreatingConversation(true);
    setErrorMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/conversations`, { method: "POST" });
      if (!response.ok) {
        throw new Error("Could not create conversation.");
      }

      const payload = (await response.json()) as { conversation: ConversationDetail };
      setActiveConversation(payload.conversation);
      setConversations((prev) => [
        {
          id: payload.conversation.id,
          title: payload.conversation.title,
          provider: payload.conversation.provider,
          model: payload.conversation.model,
          preview: payload.conversation.messages.at(-1)?.content || "",
          createdAt: payload.conversation.createdAt,
          updatedAt: payload.conversation.updatedAt,
        },
        ...prev,
      ]);
      setMobileSidebarOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create chat.");
    } finally {
      setIsCreatingConversation(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    setIsLoadingConversations(true);

    Promise.all([checkBackendHealth(), loadProviderSettings(), loadConversations()])
      .catch((error) => {
        if (mounted) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load chats.");
        }
      })
      .finally(() => {
        if (mounted) setIsLoadingConversations(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void checkBackendHealth();
    }, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const filteredConversations = useMemo(() => {
    const value = query.toLowerCase().trim();
    const sorted = [...conversations].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (!value) return sorted;

    return sorted.filter(
      (item) =>
        item.title.toLowerCase().includes(value) ||
        item.preview.toLowerCase().includes(value)
    );
  }, [conversations, query]);

  const applyProviderDefaults = (nextProvider: Provider) => {
    const match = PROVIDERS.find((item) => item.provider === nextProvider);
    if (!match) return;

    setProvider(nextProvider);
    setModel(match.defaultModel);
    setBaseUrl(match.defaultBaseUrl);
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    await fetch(`${API_BASE}/api/conversations/${conversationId}`, { method: "DELETE" });

    const next = conversations.filter((item) => item.id !== conversationId);
    setConversations(next);

    if (activeConversation?.id === conversationId) {
      if (next[0]) {
        await loadConversation(next[0].id);
      } else {
        setActiveConversation(null);
      }
    }
  };

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !activeConversation || isReplying) return;
    if (!baseUrl.trim() || !model.trim()) {
      setErrorMessage("Set provider, base URL, and model in settings first.");
      setSettingsOpen(true);
      return;
    }

    setErrorMessage("");
    setDraft("");
    setIsReplying(true);

    const userMessage: Message = {
      id: makeTempId(),
      conversationId: activeConversation.id,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    const assistantDraft: Message = {
      id: makeTempId(),
      conversationId: activeConversation.id,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };

    setActiveConversation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: [...prev.messages, userMessage, assistantDraft],
      };
    });

    setConversations((prev) =>
      prev.map((item) =>
        item.id === activeConversation.id
          ? {
              ...item,
              title: item.title === "New chat" ? content.slice(0, 40) : item.title,
              preview: content,
              provider,
              model,
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );

    try {
      await saveProviderSettings({ provider, model, baseUrl, apiKey });

      await streamChat(
        {
          conversationId: activeConversation.id,
          content,
          provider,
          model,
          baseUrl,
          apiKey,
        },
        {
          onToken: ({ full }) => {
            setActiveConversation((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                messages: prev.messages.map((message) =>
                  message.id === assistantDraft.id ? { ...message, content: full } : message
                ),
              };
            });
          },
          onDone: ({ assistantMessage }) => {
            setActiveConversation((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                provider,
                model,
                messages: prev.messages.map((message) =>
                  message.id === assistantDraft.id ? assistantMessage : message
                ),
              };
            });
            setConversations((prev) =>
              prev.map((item) =>
                item.id === activeConversation.id
                  ? {
                      ...item,
                      provider,
                      model,
                      preview: assistantMessage.content,
                      updatedAt: assistantMessage.createdAt,
                    }
                  : item
              )
            );
          },
          onError: ({ message }) => {
            setErrorMessage(message);
          },
        }
      );

      await loadConversation(activeConversation.id);
      await loadConversations();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Reply failed.");
      setActiveConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.filter(
            (message) => message.id !== userMessage.id && message.id !== assistantDraft.id
          ),
        };
      });
    } finally {
      setIsReplying(false);
    }
  };

  const handleCopyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current));
      }, 1400);
    } catch {
      setErrorMessage("Could not copy message to clipboard.");
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-muted/40">
      <div className="p-3">
        <Button className="w-full justify-start" onClick={createConversation} disabled={isCreatingConversation}>
          {isCreatingConversation ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <PenSquare className="mr-2 h-4 w-4" />
          )}
          New chat
        </Button>
      </div>

      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            className="pl-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 pb-2">
          {isLoadingConversations && (
            <div className="space-y-2 p-2">
              <div className="h-10 rounded-lg bg-background" />
              <div className="h-10 rounded-lg bg-background" />
              <div className="h-10 rounded-lg bg-background" />
            </div>
          )}

          {!isLoadingConversations && !filteredConversations.length && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No chats found.</p>
          )}

          {filteredConversations.map((conversation) => (
            <div key={conversation.id} className="group relative">
              <button
                type="button"
                onClick={() => {
                  void loadConversation(conversation.id);
                  setMobileSidebarOpen(false);
                }}
                className={cn(
                  "w-full rounded-lg px-3 py-2 pr-10 text-left transition-colors",
                  conversation.id === activeConversation?.id
                    ? "bg-background shadow-sm"
                    : "hover:bg-background/70"
                )}
              >
                <div className="truncate text-sm font-medium">{conversation.title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {conversation.preview || "No messages yet"}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {formatConversationTime(conversation.updatedAt)}
                  </span>
                </div>
              </button>

              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-8 w-8 opacity-0 group-hover:opacity-100"
                onClick={() => void handleDeleteConversation(conversation.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator />
      <div className="p-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback>AM</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Amar Account</p>
              <p className="truncate text-xs text-muted-foreground">Local workspace</p>
            </div>
            <Badge variant="secondary">SQLite</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] bg-background text-foreground">
      <div className="flex h-full">
        <aside className="hidden w-72 border-r md:block">{sidebar}</aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b px-2 sm:px-3 md:px-5">
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
              <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[92vw] max-w-[320px] p-0">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Conversation sidebar</SheetTitle>
                    <SheetDescription>
                      Browse and switch between your conversations.
                    </SheetDescription>
                  </SheetHeader>
                  {sidebar}
                </SheetContent>
              </Sheet>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="max-w-[200px] gap-2 truncate sm:max-w-none">
                    <Sparkles className="h-4 w-4" />
                    <span className="truncate text-xs sm:text-sm">
                      {PROVIDERS.find((item) => item.provider === provider)?.label}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Provider</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {PROVIDERS.map((item) => (
                    <DropdownMenuItem key={item.provider} onClick={() => applyProviderDefaults(item.provider)}>
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Badge variant="outline" className="hidden lg:inline-flex">
                {model}
              </Badge>

              <Badge
                variant={
                  healthState === "online"
                    ? "secondary"
                    : healthState === "offline"
                      ? "destructive"
                      : "outline"
                }
                className="hidden md:inline-flex"
              >
                {healthState === "online"
                  ? "API online"
                  : healthState === "offline"
                    ? "API offline"
                    : "Checking API"}
              </Badge>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="h-4 w-4" />
              </Button>
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    Account
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <CircleHelp className="mr-2 h-4 w-4" />
                    Help
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="relative flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 pb-48 pt-6 sm:px-4 sm:pt-8 md:px-8">
                {errorMessage && (
                  <Card className="border-destructive/40 bg-destructive/5">
                    <CardContent className="p-3 text-sm text-destructive">{errorMessage}</CardContent>
                  </Card>
                )}

                {!activeConversation && !isLoadingConversations && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Start a new conversation</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={createConversation}>New chat</Button>
                    </CardContent>
                  </Card>
                )}

                {activeConversation?.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("group flex items-start gap-2 sm:gap-3", message.role === "user" && "justify-end")}
                  >
                    {message.role === "assistant" && (
                      <Avatar className="mt-1 h-8 w-8 border">
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                    )}

                    <div
                      className={cn(
                        "max-w-[92%] text-sm leading-relaxed sm:max-w-[85%]",
                        message.role === "assistant"
                          ? "rounded-2xl rounded-tl-sm bg-muted px-4 py-3"
                          : "rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground"
                      )}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="mb-3 list-disc pl-5 last:mb-0">{children}</ul>,
                          ol: ({ children }) => <ol className="mb-3 list-decimal pl-5 last:mb-0">{children}</ol>,
                          li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
                          h1: ({ children }) => <h1 className="mb-2 text-lg font-semibold">{children}</h1>,
                          h2: ({ children }) => <h2 className="mb-2 text-base font-semibold">{children}</h2>,
                          h3: ({ children }) => <h3 className="mb-2 text-sm font-semibold">{children}</h3>,
                          blockquote: ({ children }) => (
                            <blockquote className="mb-3 border-l-2 border-border/70 pl-3 italic last:mb-0">
                              {children}
                            </blockquote>
                          ),
                          code: ({ className, children }) => {
                            const inline = !className;
                            if (inline) {
                              return (
                                <code className="rounded bg-black/10 px-1 py-0.5 text-[0.82em] dark:bg-white/10">
                                  {children}
                                </code>
                              );
                            }

                            return (
                              <pre className="mb-3 overflow-x-auto rounded-md border bg-background/60 p-3 text-xs last:mb-0">
                                <code>{children}</code>
                              </pre>
                            );
                          },
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-4"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {message.content || (isReplying && message.role === "assistant" ? "..." : "")}
                      </ReactMarkdown>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="mt-1 h-7 w-7 shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                      onClick={() => void handleCopyMessage(message)}
                    >
                      {copiedMessageId === message.id ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">Copy message</span>
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-3 sm:px-3 sm:pb-4 md:px-6 md:pb-6">
              <div className="pointer-events-auto mx-auto w-full max-w-3xl">
                <Card className="border bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  <CardContent className="p-2.5 sm:p-3">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={onComposerKeyDown}
                      rows={2}
                      placeholder="Message amarAI"
                      className="min-h-[52px] w-full resize-none border-0 bg-transparent p-1 text-sm outline-none placeholder:text-muted-foreground"
                    />

                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" disabled>
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" disabled>
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>

                      <Button size="icon" onClick={() => void handleSend()} disabled={!draft.trim() || isReplying || !activeConversation}>
                        {isReplying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowUp className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Responses are generated by your configured provider.
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Provider Settings</SheetTitle>
            <SheetDescription>
              Configure Gemini, Hugging Face, or any OpenAI-compatible endpoint.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Provider</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {PROVIDERS.find((item) => item.provider === provider)?.label}
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  {PROVIDERS.map((item) => (
                    <DropdownMenuItem key={item.provider} onClick={() => applyProviderDefaults(item.provider)}>
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base-url">Base URL</Label>
              <Input id="base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input id="model" value={model} onChange={(event) => setModel(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Saved in SQLite settings"
              />
            </div>

            <Button
              onClick={() => void saveProviderSettings()}
              disabled={isSavingSettings}
              className="w-full"
            >
              {isSavingSettings ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save settings"
              )}
            </Button>

            <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
              <div>Current API base: {API_BASE}</div>
              <div className="mt-1">
                Status: {healthState === "online" ? "Online" : healthState === "offline" ? "Offline" : "Checking"}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default App;
