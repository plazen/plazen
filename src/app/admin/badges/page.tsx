import { BadgeManager } from "./BadgeManager";
import AdminPage from "../AdminPage";

export default async function AdminBadgesPage() {
  return (
    <AdminPage>
      <div className="p-4 md:p-8">
        <BadgeManager />
      </div>
    </AdminPage>
  );
}
