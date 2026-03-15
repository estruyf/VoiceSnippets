"use client"

import { Download, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WelcomeScreenProps {
  onGetStarted: () => void
}

export function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] px-8 pt-6">
      <div className="flex flex-col items-center text-center max-w-md gap-6">
        {/* Heading */}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span>Welcome to</span>&nbsp;
            <span className="text-foreground">Voice</span>
            <span className="text-primary">Snippets</span>
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Transform your voice into text commands instantly. To get started, you'll need to install a Whisper model for speech recognition.
          </p>
        </div>

        {/* Steps */}
        <div className="w-full rounded-lg border border-border/50 bg-card overflow-hidden">
          <div className="flex items-start gap-3 px-4 py-3 border-b border-border">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-semibold shrink-0">
              1
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-sm text-foreground font-medium">Install a Whisper model</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                We recommend starting with the "Base" model (147 MB) for fast performance.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 px-4 py-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-semibold shrink-0">
              2
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-sm text-foreground font-medium">Add your first command</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create voice-triggered text expansions, keyboard shortcuts, and workflow automations.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <Button
          onClick={onGetStarted}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/80 gap-2"
          size="lg"
        >
          <Download className="h-4 w-4" />
          Get Started - Install Model
          <ChevronRight className="h-4 w-4 ml-auto" />
        </Button>

        {/* Footer note */}
        <p className="text-xs text-muted-foreground/70">
          All voice processing happens locally on your device. Your data never leaves your computer.
        </p>
      </div>
    </div>
  )
}
