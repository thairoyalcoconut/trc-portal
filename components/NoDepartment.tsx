export default function NoDepartment() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
      <h2 className="font-medium text-amber-800">Waiting on department assignment</h2>
      <p className="mt-2 text-sm text-amber-700">
        Your account isn&apos;t assigned to a department yet, so there&apos;s no
        data to show. Ask an admin to assign you a department and role in the
        Admin panel.
      </p>
    </div>
  );
}
