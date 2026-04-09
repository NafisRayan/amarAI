import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  CircleHelp,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  PenSquare,
  Search,
  Sparkles,
  User,
} from "lucide-react";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: Date;
};

type Conversation = {
  id: string;
  title: string;
  preview: string;
  updatedAt: Date;
  messages: Message[];
};

const MODELS = ["GPT-4.1", "o3", "GPT-4o"];

const createId = () => Math.random().toString(36).slice(2, 11);

const makeTitle = (text: string) => {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length > 32 ? `${compact.slice(0, 32)}...` : compact;
};

const generateAssistantReply = (prompt: string) => {
  return `Got it. Here is a clean response based on your request: "${prompt.slice(0, 120)}"\n\n- I can help you break this into steps.\n- I can also produce production-ready code if needed.\n- If you want, I can continue with tests and final polish next.`;
};

const initialConversations: Conversation[] = [
  {
    id: createId(),
    title: "Build a launch plan",
    preview: "Draft a launch strategy for the new release",
    updatedAt: new Date(),
    messages: [
      {
        id: createId(),
        role: "assistant",
        content:
          "Hi! I can help with product planning, coding, writing, and debugging. What should we work on first?",
        createdAt: new Date(),
      },
    ],
  },
  {
    id: createId(),
    title: "Refactor API route",
    preview: "How can I optimize this endpoint?",
    updatedAt: new Date(Date.now() - 1000 * 60 * 50),
    messages: [
      {
        id: createId(),
        role: "user",
        content: "How can I optimize this endpoint?",
        createdAt: new Date(Date.now() - 1000 * 60 * 52),
      },
      {
        id: createId(),
        role: "assistant",
        content:
          "Start by measuring N+1 queries, response size, and cache hit rate. Then optimize the biggest bottleneck first.",
        createdAt: new Date(Date.now() - 1000 * 60 * 50),
      },
    ],
  },
];

function formatConversationTime(value: Date) {
  const now = new Date();
  const sameDay = value.toDateString() === now.toDateString();
  if (sameDay) {
    return value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return value.toLocaleDateString([], { month: "short", day: "numeric" });
}

function App() {
  const [model, setModel] = useState(MODELS[0]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversations[0].id
  );

  const filteredConversations = useMemo(() => {
    const value = query.toLowerCase().trim();
    const sorted = [...conversations].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );

    if (!value) return sorted;

    return sorted.filter(
      (item) =>
        item.title.toLowerCase().includes(value) ||
        item.preview.toLowerCase().includes(value)
    );
  }, [conversations, query]);

  const activeConversation =
    conversations.find((item) => item.id === activeConversationId) ??
    conversations[0];

  const handleNewConversation = () => {
    const newConversation: Conversation = {
      id: createId(),
      title: "New chat",
      preview: "",
      updatedAt: new Date(),
      messages: [
        {
          id: createId(),
          role: "assistant",
          content: "Ready when you are. Ask anything.",
          createdAt: new Date(),
        },
      ],
    };

    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    setDraft("");
    setMobileSidebarOpen(false);
  };

  const handleSend = () => {
    const content = draft.trim();
    if (!content || !activeConversation) return;

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content,
      createdAt: new Date(),
    };

    setDraft("");
    setIsReplying(true);

    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== activeConversation.id) return conversation;

        const title =
          conversation.title === "New chat" ? makeTitle(content) : conversation.title;

        return {
          ...conversation,
          title,
          preview: content,
          updatedAt: new Date(),
          messages: [...conversation.messages, userMessage],
        };
      })
    );

    window.setTimeout(() => {
      const assistantMessage: Message = {
        id: createId(),
        role: "assistant",
        content: generateAssistantReply(content),
        createdAt: new Date(),
      };

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== activeConversation.id) return conversation;

          return {
            ...conversation,
            preview: assistantMessage.content.split("\n")[0],
            updatedAt: new Date(),
            messages: [...conversation.messages, assistantMessage],
          };
        })
      );

      setIsReplying(false);
    }, 850);
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-muted/40">
      <div className="p-3">
        <Button className="w-full justify-start" onClick={handleNewConversation}>
          <PenSquare className="mr-2 h-4 w-4" />
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
          {filteredConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => {
                setActiveConversationId(conversation.id);
                setMobileSidebarOpen(false);
              }}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-left transition-colors",
                conversation.id === activeConversationId
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
              <p className="truncate text-xs text-muted-foreground">amar@example.com</p>
            </div>
            <Badge variant="secondary">Pro</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="h-screen bg-background text-foreground">
        <div className="flex h-full">
          <aside className="hidden w-72 border-r md:block">{sidebar}</aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 items-center justify-between border-b px-3 md:px-5">
              <div className="flex items-center gap-2">
                <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[300px] p-0">
                    {sidebar}
                  </SheetContent>
                </Sheet>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      {model}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuLabel>Model</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {MODELS.map((modelOption) => (
                      <DropdownMenuItem
                        key={modelOption}
                        onClick={() => setModel(modelOption)}
                      >
                        {modelOption}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-2">
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
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-44 pt-8 md:px-8">
                  {activeConversation.messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex items-start gap-3",
                        message.role === "user" && "justify-end"
                      )}
                    >
                      {message.role === "assistant" && (
                        <Avatar className="mt-1 h-8 w-8 border">
                          <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                      )}

                      <div
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed",
                          message.role === "assistant"
                            ? "rounded-2xl rounded-tl-sm bg-muted px-4 py-3"
                            : "rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground"
                        )}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}

                  {isReplying && (
                    <div className="flex items-start gap-3">
                      <Avatar className="mt-1 h-8 w-8 border">
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                      <div className="space-y-2 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-4 w-40" />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-4 md:px-6 md:pb-6">
                <div className="pointer-events-auto mx-auto w-full max-w-3xl">
                  <Card className="border bg-background/95 shadow-sm backdrop-blur">
                    <CardContent className="p-3">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={onComposerKeyDown}
                        rows={2}
                        placeholder="Message amarAI"
                        className="min-h-[54px] w-full resize-none border-0 bg-transparent p-1 text-sm outline-none placeholder:text-muted-foreground"
                      />

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Paperclip className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Attach files</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Temporary chat</TooltipContent>
                          </Tooltip>
                        </div>

                        <Button
                          size="icon"
                          onClick={handleSend}
                          disabled={!draft.trim() || isReplying}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    amarAI can make mistakes. Check important information.
                  </p>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
