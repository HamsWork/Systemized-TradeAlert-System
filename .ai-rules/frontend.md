# Frontend Rules

## Routing

- Wouter for client-side routing. Pages in `client/src/pages/`, registered in `client/src/App.tsx`
- Use `Link` component or `useLocation` hook from `wouter` — never modify `window.location`
- Sidebar navigation in `client/src/components/app-sidebar.tsx`

## Data Fetching

- TanStack Query v5 — always use object form: `useQuery({ queryKey: [...] })`
- Default fetcher is pre-configured — queries don't need a `queryFn`
- Mutations use `apiRequest` from `@/lib/queryClient` for POST/PATCH/DELETE
- Always invalidate related query keys after mutations:
  ```ts
  queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
  ```
- Use array keys for hierarchical/variable queries: `['/api/signals', id]`
- Show loading states via `.isLoading` and pending states via `.isPending`

## Forms

- Use `react-hook-form` with Shadcn's `Form` component from `@/components/ui/form`
- Use `zodResolver` from `@hookform/resolvers/zod` for validation
- Always pass `defaultValues` to `useForm`
- Debug form issues by logging `form.formState.errors`

## Components & Styling

- Shadcn UI components imported from `@/components/ui/`
- Icons from `lucide-react` for actions, `react-icons/si` for company logos
- Tailwind CSS with dark mode via class strategy
- When not using configured utility classes, always provide explicit dark mode variants:
  `className="bg-white dark:bg-black text-black dark:text-white"`
- Custom CSS properties in `index.css` use `H S% L%` format (space-separated, no hsl() wrapper)
- `<SelectItem>` must always have a `value` prop
- Do NOT explicitly import React — Vite JSX transform handles it

## data-testid Convention

Every interactive and meaningful element must have a `data-testid`:
- Interactive: `{action}-{target}` → `button-submit`, `input-email`, `select-direction`
- Display: `{type}-{content}` → `text-username`, `badge-status`
- Dynamic lists: `{type}-{description}-{id}` → `card-signal-${signalId}`

## Signal Page Specifics

The Signals page (`/signals`) uses flat API parameters for the create form:
- Top-level fields: ticker, instrumentType, direction, entryPrice
- Conditional: expiration + strike (shown only for Options)
- Trade Plan section: TP1-3, SL1-3, raise stop method/value, notes
- Signal cards have collapsible trade plan with color-coded targets (green), stops (red), raise stop (amber)

## API Guide Page

The API Guide (`/api-guide`) is an interactive docs page:
- Sidebar navigation by section (Signals, Apps, Integrations, etc.)
- Each endpoint has a params panel (left) and code examples panel (right)
- JSON-type params render as a styled card with Textarea input
- Enum-type params render as Select dropdowns
- Code generator produces curl, Python, JavaScript, Go examples
- `parseParamValue` handles JSON string parsing for code generation
