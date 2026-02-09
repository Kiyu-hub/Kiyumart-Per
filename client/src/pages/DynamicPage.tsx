import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Converts content to proper HTML for rendering.
 * - If content is already HTML (has tags), it processes newlines within text nodes
 * - If content is plain text, it converts newlines to paragraphs and detects headings
 */
function formatContent(content: string): string {
  // Check if the content contains HTML tags
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);
  
  if (hasHtml) {
    // Content has HTML — convert plain \n within <p> or after tags to <br>
    // Split on existing tags, process text between them
    return content
      .replace(/\n\n+/g, '</p><p>')  // Double newlines become paragraph breaks
      .replace(/(?<!\>)\n(?!\<)/g, '<br>');  // Single newlines within text become <br>
  }
  
  // Plain text — convert to HTML with paragraphs
  const lines = content.split('\n');
  let html = '';
  let inList = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }
    
    // Detect numbered headings like "1. Introduction" or "2.1 Personal Information"
    if (/^\d+\.?\d*\.?\s+[A-Z]/.test(trimmed) && trimmed.length < 100) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3><strong>${trimmed}</strong></h3>`;
    }
    // Detect markdown-style headings
    else if (trimmed.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h1>${trimmed.slice(2)}</h1>`;
    } else if (trimmed.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2>${trimmed.slice(3)}</h2>`;
    } else if (trimmed.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${trimmed.slice(4)}</h3>`;
    }
    // Short standalone lines that look like list items (no period at end, short)
    else if (trimmed.length < 60 && !trimmed.endsWith('.') && !trimmed.endsWith(':')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${trimmed}</li>`;
    }
    // Regular paragraph
    else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${trimmed}</p>`;
    }
  }
  if (inList) html += '</ul>';
  
  return html;
}

interface FooterPage {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  url: string | null;
  group: string | null;
  displayOrder: number;
  isActive: boolean;
  openInNewTab: boolean;
}

export default function DynamicPage() {
  const [, params] = useRoute("/page/:slug");
  const [, navigate] = useLocation();
  const slug = params?.slug || "";

  const { data: pages = [], isLoading } = useQuery<FooterPage[]>({
    queryKey: ["/api/footer-pages"],
  });

  const page = pages.find((p) => p.slug === slug);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex items-center justify-end p-2 border-b bg-background">
          <ThemeToggle />
        </div>
        <Header onCartClick={() => navigate("/cart")} data-testid="header-dynamic-page" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading page...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex items-center justify-end p-2 border-b bg-background">
          <ThemeToggle />
        </div>
        <Header onCartClick={() => navigate("/cart")} data-testid="header-dynamic-page" />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <CardTitle>Page Not Found</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                The page you're looking for doesn't exist or has been removed.
              </p>
              <Button onClick={() => navigate("/")} className="w-full" data-testid="button-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-end p-2 border-b bg-background">
        <ThemeToggle />
      </div>
      <Header onCartClick={() => navigate("/cart")} data-testid="header-dynamic-page" />
      
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="text-3xl" data-testid="text-page-title">
                {page.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {page.content ? (
                <div 
                  className="prose prose-slate dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: formatContent(page.content) }}
                  data-testid="text-page-content"
                />
              ) : (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground text-lg">
                    This page is under construction. Please check back later.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
