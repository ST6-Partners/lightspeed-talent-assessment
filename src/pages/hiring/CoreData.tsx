// ============================================================
// CORE DATA — landing hub for the reference-data sections.
// Replaces the six separate sidebar links with one entry that
// opens this page; each card navigates to its section.
// ============================================================
import { Link } from 'react-router-dom';
import { Contact, Building2, Tag, Award, FileText, Megaphone } from 'lucide-react';

const ITEMS = [
  { path: '/hiring/employees',   label: 'Employees',        icon: Contact,   desc: 'The people directory behind internal moves, org data, and reviews.' },
  { path: '/hiring/departments', label: 'Departments',      icon: Building2, desc: 'Company functions used to route roles, tasks, and approvals.' },
  { path: '/hiring/titles',      label: 'Titles',           icon: Tag,       desc: 'Standard job titles and levels used across requisitions.' },
  { path: '/hiring/values',      label: 'Company Values',   icon: Award,     desc: 'The values candidates are scored against during assessment.' },
  { path: '/hiring/jobs',        label: 'Job Descriptions', icon: FileText,  desc: 'The library of role descriptions that feed intake and postings.' },
  { path: '/hiring/postings',    label: 'Open Roles',       icon: Megaphone, desc: 'Positions currently posted to candidates.' },
];

export default function CoreData() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Core Data</h1>
        <p className="text-sm text-gray-500 mt-1">The reference data behind hiring. Pick a section to view or edit it.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className="group bg-white rounded-xl border border-gray-200 p-5 hover:border-ls-cyan hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg ls-accent-grad text-white flex items-center justify-center shrink-0">
                  <Icon size={20} />
                </div>
                <div className="text-base font-semibold text-gray-900 group-hover:text-ls-primary">{item.label}</div>
              </div>
              <p className="text-[13px] text-gray-500 leading-snug">{item.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
