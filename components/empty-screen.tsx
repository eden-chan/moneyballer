import { UseChatHelpers } from 'ai/react'

import { Button } from '@/components/ui/button'
import { ExternalLink } from '@/components/external-link'
import { IconArrowRight } from '@/components/ui/icons'

export function EmptyScreen() {
  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="flex flex-col gap-2 rounded-lg border bg-background p-8">
        <h1 className="text-lg font-semibold">
          Welcome to MoneyBaller: Empirical Analysis of Undervalued Developer Talent
        </h1>
        <p className="leading-normal text-muted-foreground">
          MoneyBaller revolutionizes tech recruitment by applying data-driven analysis to identify undervalued developer talent in the open-source community. We leverage{' '}
          <ExternalLink href="https://fetch.ai/">Fetch AI</ExternalLink> for agentic workflows,{' '}
          <ExternalLink href="https://github.com/">GitHub</ExternalLink> for comprehensive profiling, and{' '}
          <ExternalLink href="https://groq.com/">Groq API</ExternalLink> with the LLaMA 3 model for fast inference and an interactive chat interface.
        </p>
        <p className="leading-normal text-muted-foreground">
          Our system uses advanced LLMs for deterministic code quality assessment, contributor network analysis, and empirical analysis of coding skills. With MoneyBaller, you can explore talent insights through natural language queries, powered by Groq's high-speed inference capabilities.
        </p>
        <p className="leading-normal text-muted-foreground">
          Discover the future of tech recruitment with MoneyBaller - where data meets talent, and innovation meets opportunity.
        </p>
      </div>
    </div>
  )
}
