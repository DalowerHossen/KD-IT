// path: components/design-system/overlay-demos.tsx
"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/use-toast";
import { strings } from "@/lib/i18n/strings/en";

/** Dialog, drawer, popover, menu, and destructive-confirmation demos. */
export function OverlayDemos(): ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirmDestructive = (): void => {
    setConfirmOpen(false);
    toast({
      title: "Demo item deleted",
      description: "The undo window stays open for five seconds.",
      variant: "destructive",
      action: (
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast({ title: "Demo item restored", variant: "success" })}
        >
          Undo
        </Button>
      ),
    });
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Open dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog pattern</DialogTitle>
            <DialogDescription>
              Focus is trapped while the dialog is open and returns to the trigger on close. Escape
              closes it.
            </DialogDescription>
          </DialogHeader>
          <p className="text-body-sm text-muted-foreground">
            Dialogs host focused tasks such as confirmations and short forms.
          </p>
        </DialogContent>
      </Dialog>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Open drawer</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Drawer pattern</SheetTitle>
            <SheetDescription>
              Drawers are full-screen on mobile and side sheets on larger screens.
            </SheetDescription>
          </SheetHeader>
          <p className="text-body-sm text-muted-foreground">
            Use drawers for navigation and secondary workflows that need more room than a dialog.
          </p>
        </SheetContent>
      </Sheet>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Open popover</Button>
        </PopoverTrigger>
        <PopoverContent>
          <p className="text-body-sm">
            Popovers carry small contextual tools such as filters and pickers.
          </p>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            Menu
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Row actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => toast({ title: "Edit selected" })}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast({ title: "Duplicate selected" })}>
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => toast({ title: "Archive selected", variant: "warning" })}
          >
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive">Delete demo item</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this item?</DialogTitle>
            <DialogDescription>
              Destructive actions always ask for confirmation and offer an undo window afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {strings.actions.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmDestructive}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
