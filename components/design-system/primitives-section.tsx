// path: components/design-system/primitives-section.tsx
import { Info } from "lucide-react";
import type { ReactElement } from "react";

import { RemovableTagDemo } from "@/components/design-system/removable-tag-demo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Static primitives gallery; every control renders its real variants. */
export function PrimitivesSection(): ReactElement {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Buttons</CardTitle>
          <CardDescription>
            Six variants across three sizes with a 44px default target.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button isLoading>Saving</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RemovableTagDemo />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Indicators</CardTitle>
          <CardDescription>Avatars, progress, loading indicators, and helpers.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar>
              <AvatarFallback>JR</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>KD</AvatarFallback>
            </Avatar>
            <Spinner size="md" label="Loading" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="demo-progress">Progress</Label>
            <Progress id="demo-progress" value={64} aria-label="Demo progress" />
          </div>
          <Separator />
          <div className="flex items-center gap-2">
            <Checkbox id="demo-checkbox" defaultChecked />
            <Label htmlFor="demo-checkbox">Checked option</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More information">
                  <Info aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tooltips explain icon-only actions.</TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
