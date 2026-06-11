import { PendingDesignPage } from "@/components/pending-design-page";

export default function UsersPage() {
  return (
    <PendingDesignPage
      route="/users"
      titleZh="使用者與角色"
      titleEn="Users and roles"
      summary="Placeholder for issuer back-office role management."
      bullets={[
        "Expected roles include bank_program_admin, bank_ops_viewer, and bank_finance.",
        "This scaffold does not invent forms or permission matrices before design.",
      ]}
    />
  );
}
