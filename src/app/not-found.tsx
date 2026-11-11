import { Link } from "react-router"
import { Page } from "@/components/page"
import { Button } from "@/components/ui/button"

export function NotFound() {
  return (
    <Page className="items-center py-24 text-center">
      <h1 className="text-xl font-semibold">Страница не найдена</h1>
      <p className="text-sm text-muted-foreground">Ссылка устарела или раздел недоступен для вашей роли.</p>
      <Button asChild><Link to="/">На дашборд</Link></Button>
    </Page>
  )
}
