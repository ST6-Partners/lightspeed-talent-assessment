/**
 * ATA — AI Talent Assessment: real Job Description + Requisition seed data
 * ----------------------------------------------------------------------------
 * Source: 20 real Lightspeed job descriptions (uploaded by Jade, 2026-06-30).
 * Built in a Cowork session that could NOT reach the repo or DB directly, so
 * this is a HANDOFF artifact: a session with repo access maps these objects to
 * the actual Drizzle schema and runs them as a seed (and as the sample cleanup).
 *
 * DESIGN DECISIONS baked in (per Jade, 2026-06-30):
 *   • One requisition per job (20 reqs, each with exactly one JD).
 *   • NO CCAT threshold — intentionally omitted everywhere (it was identical
 *     for every role, so it's being removed from the model + form + table).
 *   • EPP values are a first-pass JUDGMENT CALL (2–3 per role) for Jade to review.
 *   • Hiring managers: reuse existing dept managers where they exist
 *       Engineering → Priya Nair, Product → Sofia Reyes,
 *       Sales → Marcus Bell, Customer Success → Dana Liu.
 *     Departments with no manager on file (Operations, Legal, HR, Marketing)
 *     use placeholder "Wes Anderson" — FINALIZE LATER.
 *   • Department values use the app's existing dropdown set:
 *       Engineering, Product, Sales, Marketing, Operations, Finance, HR,
 *       Customer Success, Legal, Other.
 *   • status: 'draft' for everything (nothing goes live until published).
 *
 * FIELD-NAME NOTE for the push session: the keys below mirror the app's form
 * fields. Rename to match the real Drizzle column names if they differ
 * (e.g. requisitionId FK wiring, eppValues storage shape).
 */

export type EppValue =
  | 'Coachable' | 'Purposeful' | 'Resilient' | 'Collaborative' | 'Humble'
  | 'Transparent' | 'Accountable' | 'Courageous' | 'Creative' | 'Driven'
  | 'Focused' | 'High Standards' | 'Self-Aware';

export interface SeedRequisition {
  department: string;
  hiringManager: string;
  openings: number;
  employmentType: 'Full-Time' | 'Part-Time' | 'Contract' | 'Internship';
  location: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  remoteEligible: boolean;
  reasonForHire?: string;
  status: 'draft' | 'open';
}

export interface SeedJobDescription {
  title: string;
  summary: string;
  responsibilities: string[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  // NO ccatThreshold — removed by design.
  workSampleInstructions?: string;
  eppValues: EppValue[];      // first-pass picks — Jade to review
  status: 'draft' | 'published';
}

export interface SeedRole {
  key: string;                // stable id for wiring req <-> jd
  sourceFile: string;         // original .docx, for traceability
  requisition: SeedRequisition;
  jobDescription: SeedJobDescription;
}

const FT = 'Full-Time' as const;

export const ataSeedRoles: SeedRole[] = [
  {
    key: 'vp-security-cloud-ops',
    sourceFile: '24. Job description for VP of Security and Cloud Ops.docx',
    requisition: {
      department: 'Engineering', hiringManager: 'Priya Nair', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'High',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'VP, Security & Cloud Operations',
      summary:
        'Reporting to the CTO, the VP of Security & Cloud Operations leads our cloud infrastructure and security practices. You own the cloud environment (AWS) and its costs, lead a 24x7x365 global cloud operations team, and establish the strategy and programs that protect our infrastructure and information assets.',
      responsibilities: [
        'Develop and execute a strategic cybersecurity vision aligned with organizational goals; set security policy and procedure.',
        'Identify and assess security risks and lead mitigation; ensure compliance with relevant regulations and standards.',
        'Implement and manage security measures across infrastructure, networks, and systems; evaluate and recommend security tooling.',
        'Lead, mentor, and grow a team of cybersecurity and cloud operations professionals across multiple locations.',
        'Own the vision, design, and deployment of cloud infrastructure (compute, storage, network) and run a 24x7x365 operation.',
        'Manage the AWS vendor relationship and cloud costs; analyze usage, drive cost-optimization, and own budgeting/forecasting.',
        'Establish KPIs, SLAs, and metrics; communicate area health through operational reviews against industry benchmarks.',
        'Deliver cybersecurity awareness and training programs for employees at all levels.',
      ],
      requiredQualifications: [
        'Proven senior leadership experience in cybersecurity with a track record of strategy development and implementation.',
        'Track record of building teams and overseeing cloud infrastructure for large-scale SaaS services.',
        'BS in Computer Science or related field (MS preferred), or equivalent practical experience.',
        '10+ years of hands-on technical experience plus strong management and communication skills.',
        'Expertise in cloud privacy and cybersecurity principles, security architecture, risk management, and compliance.',
        'Real-world experience managing global 24/7/365 operations, escalation procedures, and on-call staff.',
        'Deep, practical knowledge of primary global data-protection laws and practices.',
      ],
      preferredQualifications: ["Master's degree in Computer Science or a related technical field."],
      eppValues: ['Accountable', 'High Standards', 'Focused'],
      status: 'draft',
    },
  },
  {
    key: 'automation-architect',
    sourceFile: 'Automation Architect_JD_20210423.docx',
    requisition: {
      department: 'Engineering', hiringManager: 'Priya Nair', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'Medium',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'Automation Architect',
      summary:
        'Maintain, design, and implement automation frameworks and architecture, leading test strategy and execution and defining automation standards and best practices across the engineering organization.',
      responsibilities: [
        'Maintain, design, and implement automation frameworks and architecture.',
        'Lead the implementation of test strategy, test plans, and test execution.',
        'Define automation strategy, standards, and best practices.',
        'Collaborate with product and development teams to align automation strategy with the roadmap and business needs.',
        'Continuously evaluate tools and methodology to enhance automation testing.',
        'Implement and develop automation frameworks within the CI/CD pipeline to streamline release and delivery.',
      ],
      requiredQualifications: [
        'BS in Computer Science or equivalent experience.',
        '5–7+ years in QA or developing automated tests.',
        'Strong knowledge of best practices for test suite development.',
        'Expertise with automation frameworks; hands-on Selenium with Ruby, Java, and Cucumber.',
        'Hands-on CI/CD management with Jenkins and Selenium Grid.',
        'Expertise in AWS services or other cloud-based infrastructure.',
        'Experience with bug-tracking systems (Jira preferred).',
      ],
      preferredQualifications: [
        'Knowledge of Redis, Ruby, Node.js, Postgres.',
        'Knowledge of GraphQL.',
        'Knowledge of the Karate testing framework.',
      ],
      eppValues: ['High Standards', 'Focused', 'Collaborative'],
      status: 'draft',
    },
  },
  {
    key: 'business-analyst',
    sourceFile: 'Business Analyst_JD_20250527.docx',
    requisition: {
      department: 'Product', hiringManager: 'Sofia Reyes', openings: 1,
      employmentType: FT, location: 'Austin, TX (hybrid)', priority: 'Medium',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'Business Analyst',
      summary:
        'Join the Product Management team to bridge business needs and technical solutions — gathering requirements, analyzing market trends, and supporting the development of impactful EdTech products alongside PMs, Engineers, Designers, and stakeholders.',
      responsibilities: [
        'Collaborate with PMs, customers, and internal teams to define product requirements and translate business needs into functional specifications.',
        'Analyze industry trends, competitor offerings, and customer feedback to shape product development.',
        'Identify inefficiencies in product workflows and recommend solutions to optimize UX and operational performance.',
        'Leverage data analytics to track product performance, measure impact, and recommend enhancements.',
        'Serve as a liaison between technical teams, business units, and customers to ensure alignment.',
        'Create clear documentation — user stories, business cases, and process flows.',
      ],
      requiredQualifications: [
        '2+ years as a Business Analyst, Product Analyst, or related role (EdTech/SaaS preferred).',
        'Strong proficiency in SQL, data visualization (Tableau, Power BI), JIRA, Confluence, and Excel.',
        'Understanding of Agile methodologies, product development lifecycles, and UX best practices.',
        'Ability to break down complex problems and translate data into actionable insights.',
        'Strong verbal and written communication; able to work cross-functionally and present to diverse audiences.',
      ],
      preferredQualifications: [
        'A deep interest in education and student safety.',
        'Note: hybrid role, several days/week onsite in Austin, TX. Sponsorship not available.',
      ],
      eppValues: ['Collaborative', 'Focused', 'Transparent'],
      status: 'draft',
    },
  },
  {
    key: 'customer-support-representative',
    sourceFile: 'Customer Service Representative_JD_DRAFT_20250213.docx',
    requisition: {
      department: 'Customer Success', hiringManager: 'Dana Liu', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'Medium',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'Customer Support Representative',
      summary:
        'Be the first point of contact for customers, ensuring a positive experience with our products and support team. Work with support and triage teams to manage inquiries, identify needs, and deliver solutions in a fast-paced SaaS environment.',
      responsibilities: [
        'Respond to customer inquiries across phone, email, and chat in a timely, professional manner.',
        'Create and manage support tickets in Salesforce with accurate documentation.',
        'Perform initial discovery and prioritization of inbound cases, routing complex issues appropriately.',
        'Troubleshoot and resolve common technical issues related to product administration.',
        'Provide clear, step-by-step product guidance and best practices.',
        'Maintain and exceed SLAs for response and resolution times.',
        'Relay customer feedback to other departments and help maintain support/knowledge-base documentation.',
      ],
      requiredQualifications: [
        'Proven customer support or client service experience.',
        'Strong verbal and written communication skills.',
        'Customer-focused mindset with excellent problem-solving abilities.',
        'Able to explain technical concepts in simple terms.',
        'Strong multitasking in a fast-paced environment.',
        'Proficiency in CRM systems, Salesforce preferred.',
        'High school diploma.',
      ],
      preferredQualifications: ['Salesforce experience.'],
      eppValues: ['Coachable', 'Collaborative', 'Resilient'],
      status: 'draft',
    },
  },
  {
    key: 'manager-strategic-solutions-engineering',
    sourceFile: 'DRAFT JD_Manager_Strategic_Solutions_Engineering_JD.docx',
    requisition: {
      department: 'Sales', hiringManager: 'Marcus Bell', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'High',
      remoteEligible: true, reasonForHire: 'Scale the Solutions Engineering function',
      status: 'draft',
    },
    jobDescription: {
      title: 'Manager, Strategic Solutions Engineering',
      summary:
        'Lead a team of Strategic Solutions Engineers supporting the pre- and post-sales journey across K–12 districts. Drive technical excellence and delivery standards, develop the team, and personally carry a portfolio of strategic named accounts as the primary SE across their full lifecycle.',
      responsibilities: [
        'Hire, onboard, mentor, and develop a team of Strategic Solutions Engineers; run IDPs, weekly 1:1s, and structured reviews.',
        'Champion a coaching-first culture; build a succession pipeline and treat team members’ advancement as a success metric.',
        'Oversee tailored technical demos, POCs, and solution proposals for strategic K–12 prospects.',
        'Engage directly with CIOs/CTOs and senior IT leaders, providing executive-level technical credibility.',
        'Own a portfolio of strategic named accounts as primary SE; project-manage POCs and implementations cross-functionally.',
        'Monitor post-sale technical health, drive escalations, and translate field insights into repeatable playbooks.',
        'Serve as primary liaison to Sales, Support, and Product; report on team KPIs (utilization, CSAT, time-to-value, retention).',
      ],
      requiredQualifications: [
        'Proven experience managing/leading a Solutions, Sales, or Customer Success Engineering team in B2B technology.',
        'Deep technical knowledge of enterprise IT infrastructure: cloud, networking, and security.',
        'Experience with user provisioning (Azure, Active Directory, Google Admin Console) and endpoint management (GPO, SCCM, Intune).',
        'Demonstrated ability to hire, develop, and retain technical talent.',
        'Excellent communication and executive presence with C-level stakeholders.',
        'Strategic mindset with hands-on capability, including managing a personal account portfolio.',
      ],
      preferredQualifications: [
        'Experience in or passion for the K–12 education sector.',
        'Familiarity with CRM/customer-success platforms (ChurnZero, Salesforce).',
        'Up to 25% travel.',
      ],
      eppValues: ['Coachable', 'Accountable', 'Driven'],
      status: 'draft',
    },
  },
  {
    key: 'director-strategic-programs',
    sourceFile: 'DSP_JD_20260504.docx',
    requisition: {
      department: 'Operations', hiringManager: 'Wes Anderson', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'High',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'Director, Strategic Programs',
      summary:
        'Lead high-impact, cross-functional initiatives that drive company growth, operational excellence, and strategic alignment. Partner with executive leadership to translate strategy into execution and serve as a central point of coordination across the company.',
      responsibilities: [
        'Partner with leadership to define, prioritize, and operationalize strategic initiatives aligned with company goals.',
        'Translate high-level strategy into actionable programs with clear milestones, owners, and success metrics.',
        'Lead end-to-end execution of complex, cross-functional programs; establish governance, timelines, and reporting frameworks.',
        'Identify risks, dependencies, and resource constraints; drive mitigation and accountability across teams.',
        'Facilitate executive-level communication — program updates, dashboards, and business reviews.',
        'Build and scale program-management methodologies, tools, and best practices; drive process improvements.',
      ],
      requiredQualifications: [
        '5–8+ years in program management, strategy, operations, or consulting.',
        'Proven track record leading complex, cross-functional initiatives in a high-growth environment.',
        'Strong executive presence working closely with senior leadership.',
        'Exceptional organizational, communication, and stakeholder-management skills.',
        'Ability to navigate ambiguity and drive clarity in fast-paced environments.',
      ],
      preferredQualifications: [
        'Experience in EdTech, SaaS, or K–12 education markets.',
        'Familiarity with product development lifecycles and go-to-market strategies.',
        'Experience implementing program-management frameworks (Agile, OKRs).',
        'MBA or equivalent experience.',
      ],
      eppValues: ['Accountable', 'Focused', 'Transparent'],
      status: 'draft',
    },
  },
  {
    key: 'director-privacy-compliance',
    sourceFile: 'Director, Privacy Compliance _JD_20230116.docx',
    requisition: {
      department: 'Legal', hiringManager: 'Wes Anderson', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'High',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'Director, Privacy Compliance',
      summary:
        'Within Global Operations, oversee privacy, data protection, and data security to ensure customer and employee personal information is safe. Lead the privacy program, external audits, and compliance with global privacy and security frameworks.',
      responsibilities: [
        'Develop and execute a comprehensive compliance strategy aligned with company goals.',
        'Deliver clear, timely privacy-program reporting to senior management and/or the Board, including metrics and dashboards.',
        'Lead core documentation, external privacy audits, and day-to-day operation of the privacy program.',
        'Maintain current knowledge of US and international data-privacy laws, including data-transfer requirements.',
        'Conduct privacy impact and vendor assessments; develop remediation plans and document findings.',
        'Lead privacy-violation reviews and investigations; develop and adapt privacy policies and procedures.',
        'Support contracts/DPAs as a privacy SME and help deliver the privacy awareness program.',
      ],
      requiredQualifications: [
        'Legal qualification and/or IAPP privacy certifications (CIPP/CIPM/CIPT) with project-management experience.',
        'Demonstrated understanding of domestic and international privacy/data-protection laws.',
        'Experience implementing and maintaining a privacy framework such as Privacy by Design.',
        'General understanding of information-security principles and IT systems.',
        'Experience managing multiple projects with varying deadlines.',
        'High personal integrity and confidentiality; strong analytical and documentation skills.',
      ],
      preferredQualifications: [
        'Experience with project-management practices, tools, and methodology.',
        'Proficiency in Office applications (Outlook, Word, Excel, PowerPoint).',
      ],
      eppValues: ['Accountable', 'High Standards', 'Transparent'],
      status: 'draft',
    },
  },
  {
    key: 'front-end-engineer',
    sourceFile: 'Front End Engineer_JD_202309.docx',
    requisition: {
      department: 'Engineering', hiringManager: 'Priya Nair', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'Medium',
      remoteEligible: true, status: 'draft',
    },
    jobDescription: {
      title: 'Front End Engineer',
      summary:
        'Build intuitive, elegant, user-centric interfaces for products spanning appliances, mobile apps, networking, and cloud SaaS. Deliver new user-facing features and turn complex data into compelling, usable interfaces.',
      responsibilities: [
        'Write test-driven, clean, efficient code to deliver new user-facing front-end features.',
        'Build modular layouts and reusable libraries for future use.',
        'Translate business requirements and UI/UX wireframes into high-quality, usable interfaces.',
        'Transform large, complex datasets into beautiful visualizations.',
        'Optimize applications for speed and scalability; ensure technical feasibility of UI/UX designs.',
        'Document programming-related information and collaborate with team members and stakeholders.',
      ],
      requiredQualifications: [
        'BS in Computer Science or equivalent experience.',
        '5+ years of front-end commercial software development.',
        'Strong JavaScript, React/Redux, CSS.',
        'Experience with AWS services and UX/UI work.',
        'Experience with GitHub or similar; understanding of cross-browser compatibility.',
        'Excellent communication and problem-solving skills.',
      ],
      preferredQualifications: ['Avid follower of the tech industry and current technology trends.'],
      eppValues: ['Collaborative', 'Creative', 'High Standards'],
      status: 'draft',
    },
  },
  {
    key: 'gm-international',
    sourceFile: 'GM International_JD_20240816.docx',
    requisition: {
      department: 'Sales', hiringManager: 'Marcus Bell', openings: 1,
      employmentType: FT, location: 'United Kingdom', priority: 'High',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'General Manager, International',
      summary:
        'Lead sales, expansion, and operational management of our K–12 SaaS solutions globally outside the US. Reporting to the CRO, drive market penetration, revenue growth, and customer retention across multiple international regions.',
      responsibilities: [
        'Develop and implement a comprehensive international growth strategy; prioritize key markets aligned with company goals.',
        'Oversee day-to-day operations across international markets; manage P&L and optimize resource allocation.',
        'Build strategic partnerships with educational institutions, government bodies, and key stakeholders.',
        'Lead market research on regional trends, regulatory requirements, and the competitive landscape.',
        'Recruit, mentor, and lead a high-performing cross-functional team; ensure international/US collaboration.',
        'Work with product/engineering so offerings meet international needs; lead customer-success and retention initiatives.',
        'Ensure compliance with local regulations; identify and mitigate expansion risks.',
      ],
      requiredQualifications: [
        "Bachelor's in Business, Education, or related field (MBA or advanced degree preferred).",
        '10+ years in SaaS/EdTech leadership with a focus on international markets.',
        'Proven experience scaling businesses globally, particularly in K–12 education.',
        'Strong background in P&L management, strategic planning, and operational execution.',
        'Exceptional leadership and cross-functional team management; excellent negotiation and stakeholder skills.',
      ],
      preferredQualifications: [
        'Deep understanding of global K–12 education markets.',
        'Proficiency in multiple languages.',
      ],
      eppValues: ['Driven', 'Accountable', 'Courageous'],
      status: 'draft',
    },
  },
  {
    key: 'hr-generalist',
    sourceFile: 'HR Generalist_JD_20230616.docx',
    requisition: {
      department: 'HR', hiringManager: 'Wes Anderson', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'Medium',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'HR Generalist',
      summary:
        'Join a lean HR team with responsibility across compliance, payroll, policies, total rewards, employee engagement, development, and recruiting. Use high EQ and critical thinking to deliver outstanding employee experiences and improve HR processes.',
      responsibilities: [
        'Be the People Ops point of contact for payroll; own payroll documentation and validation with finance.',
        'Serve as in-house benefits SME and provider POC; manage benefits billing and annual compliance reporting.',
        'Contribute to recruiting efforts and facilitate employee onboarding.',
        'Manage employee files and lifecycle documentation; ensure timely processing of salary changes, promotions, transfers, terminations, and exit interviews.',
        'Maintain the HRIS and train employees/managers; provide excellent employee relations support.',
        'Manage employee-relations issues and investigations; conduct stay interviews and support engagement initiatives.',
        'Administer policies fairly and maintain compliance with US and UK employment and benefits laws (e.g., EEO-1).',
      ],
      requiredQualifications: [
        "Bachelor's degree highly desired; equivalent experience and/or HR certification considered in lieu.",
        '3–7 years of progressive experience across payroll, benefits, recruitment, employee relations, total rewards, L&D, and policy development.',
        'Demonstrated ability to maintain strict confidentiality; analytical, detail-oriented, organized.',
        'Advanced proficiency with Microsoft Office, ATS, and HRIS.',
        'Advanced knowledge of employment laws, payroll, and compliance requirements.',
        'Strong communication and interpersonal skills across all levels of the organization.',
      ],
      preferredQualifications: ['Experience supporting both US and UK employee populations.'],
      eppValues: ['Collaborative', 'Accountable', 'Resilient'],
      status: 'draft',
    },
  },
  {
    key: 'marketing-events-coordinator',
    sourceFile: 'Marketing Events Coordinator_JD_20230616.docx',
    requisition: {
      department: 'Marketing', hiringManager: 'Wes Anderson', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'Medium',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'Marketing Events Coordinator',
      summary:
        'Support the marketing team in researching, planning, organizing, and executing national and regional tradeshows, channel-partner events, and customer events. Detail-obsessed, fast-paced, and able to pivot quickly.',
      responsibilities: [
        'Research industry events and analyze opportunities for participation; gather sponsorship and attendee info for event strategy.',
        'Register for events, secure booth space, and manage logistical execution for successful events.',
        'Manage the portfolio of show presentations/presenters and secure speaking opportunities.',
        'Organize tradeshow/event logistics and shipping; ensure branded items arrive on time.',
        'Manage local venue relationships for parties/dinners; coordinate pre-event kickoffs and post-event reviews.',
        'Order and maintain promotional materials and inventory; maintain event calendars and booking records.',
      ],
      requiredQualifications: [
        'A passion for working with people and helping the community.',
        'Detail-oriented; able to track and manage all details of a project or event.',
        'Self-driven and motivated; approaches challenges with resilience and creativity.',
        'Able to work independently and as part of a team; personable and presentable.',
        'Available for some travel to support live events.',
      ],
      preferredQualifications: ['Prior events or tradeshow coordination experience.'],
      eppValues: ['Focused', 'Resilient', 'Driven'],
      status: 'draft',
    },
  },
  {
    key: 'senior-director-software-quality',
    sourceFile: 'Senior Director Software Quality_JD_20250200.docx',
    requisition: {
      department: 'Engineering', hiringManager: 'Priya Nair', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'High',
      remoteEligible: true, status: 'draft',
    },
    jobDescription: {
      title: 'Senior Director, Software Quality',
      summary:
        'Define and execute a scalable, cloud-first QA strategy ensuring the highest quality of our SaaS products. Drive automation, DevOps integration, and continuous quality improvement across all engineering teams while leading a team of QA managers and engineers.',
      responsibilities: [
        'Define and execute a modern QA strategy spanning automated, performance, security, and cloud-based testing.',
        'Lead and mentor QA teams; establish best practices for test automation, defect tracking, and performance monitoring.',
        'Integrate QA into CI/CD pipelines and implement shift-left testing across the SDLC.',
        'Oversee test planning, execution, and reporting for functional, regression, security, and performance testing.',
        'Define QA metrics/KPIs and report quality insights to stakeholders; lead RCA and defect-resolution efforts.',
        'Partner with Engineering and Customer Support to improve reliability and proactively address production issues.',
      ],
      requiredQualifications: [
        '10+ years of QA leadership (Director-level or higher) in fast-paced SaaS/cloud environments.',
        'Strong expertise in QA methodologies, automation frameworks, and testing best practices.',
        'Experience designing test automation in CI/CD and DevOps workflows; deep Agile/SDLC/shift-left knowledge.',
        'Hands-on with Selenium, Cypress, Playwright, JUnit, TestNG; cloud testing (AWS Device Farm, LambdaTest, Sauce Labs).',
        'Performance testing (JMeter, Gatling) and security testing; experience with Jira, GitHub Actions, Jenkins, SQL.',
        'Proven ability to lead strategic initiatives and drive cross-functional collaboration.',
      ],
      preferredQualifications: [
        'Experience in EdTech or security-focused software.',
        'Familiarity with containerized environments (Docker, Kubernetes).',
        'Hands-on experience with AI-driven test automation and predictive analytics for QA.',
      ],
      eppValues: ['High Standards', 'Accountable', 'Focused'],
      status: 'draft',
    },
  },
  {
    key: 'senior-front-end-engineer',
    sourceFile: 'Senior Front End Engineer_JD_202306.docx',
    requisition: {
      department: 'Engineering', hiringManager: 'Priya Nair', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'Medium',
      remoteEligible: true, status: 'draft',
    },
    jobDescription: {
      title: 'Senior Front End Engineer',
      summary:
        'Own more complex front-end features end to end, partnering with Product, QA, and other stakeholders on a technical level, while building intuitive, user-centric interfaces across our product suite.',
      responsibilities: [
        'Write test-driven, clean, efficient code to deliver new user-facing front-end features.',
        'Build modular layouts and reusable libraries; translate requirements and wireframes into high-quality interfaces.',
        'Transform large, complex datasets into beautiful visualizations; optimize for speed and scalability.',
        'Ensure technical feasibility of UI/UX designs and document programming information.',
        'Serve as the go-to expert on at least one area of the codebase with broad infrastructure knowledge.',
        'Own meaningful parts of the service and collaborate with team members and stakeholders.',
      ],
      requiredQualifications: [
        'BS in Computer Science or equivalent experience.',
        '5+ years of front-end commercial software development.',
        'Strong JavaScript, React/Redux, CSS; experience with AWS services and UX/UI.',
        'Experience with GitHub or similar; understanding of cross-browser compatibility.',
        'Excellent communication and problem-solving skills.',
      ],
      preferredQualifications: ['Avid follower of the tech industry and current technology trends.'],
      eppValues: ['Collaborative', 'High Standards', 'Accountable'],
      status: 'draft',
    },
  },
  {
    key: 'software-engineer',
    sourceFile: 'Software Engineer_JD_202309.docx',
    requisition: {
      department: 'Engineering', hiringManager: 'Priya Nair', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'Medium',
      remoteEligible: true, status: 'draft',
    },
    jobDescription: {
      title: 'Software Engineer',
      summary:
        "Our development team is growing and we're looking for software engineers to help build our suite of award-winning K-12 solutions. Our engineers are problem-solvers who work closely with QA, Product, and other teams to design, build, test, and maintain the digital platform — with direct, meaningful impact on the product roadmap.",
      responsibilities: [
        'Identify and uphold full-stack engineering best practices.',
        'Collaborate with designers and product managers to iterate on design and implementation.',
        'Design and create services that scale with the needs of the company.',
        'Monitor performance, watch for usability-related issues, and resolve them.',
        'Review application and feature code, and plan future API upgrades with the team.',
        'Build applications and features for the website, mobile app, and external client apps.',
        'Stay up to date on emerging technologies and modern libraries/tooling.',
      ],
      requiredQualifications: [
        '3+ years building large-scale web applications with Go and JavaScript/React.',
        'Strong Go and JavaScript programming skills and data structures.',
        'Microservices architecture and development experience.',
        'Solid knowledge of SQL and NoSQL databases (Oracle, Postgres, Cassandra).',
        'Experience with messaging architectures (Kafka or equivalent).',
        'Proven experience building RESTful APIs with deep understanding of REST principles.',
        'Experience with Docker or similar, Git, CI/CD, and writing unit/integration tests.',
      ],
      preferredQualifications: [
        'Experience with cloud platforms such as Azure or Pivotal Cloud Foundry.',
        'Familiarity with the Node and React ecosystem.',
        'Experience with e-commerce modules such as catalog and search (Solr, ElasticSearch).',
        'Experience building high-volume, fault-tolerant, distributed cloud-native systems.',
        'Agile development; familiarity with A/B testing, monitoring, and alerting.',
      ],
      eppValues: ['Collaborative', 'Accountable', 'High Standards'],
      status: 'draft',
    },
  },
  {
    key: 'staff-front-end-engineer',
    sourceFile: 'Staff Front End Engineer_JD.docx',
    requisition: {
      department: 'Engineering', hiringManager: 'Priya Nair', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'High',
      remoteEligible: true, status: 'draft',
    },
    jobDescription: {
      title: 'Staff Front End Engineer',
      summary:
        'Help shape broader architecture and own major pieces of front-end infrastructure, delivering exceptional user-facing experiences. Provide technical guidance, set product-level technical strategy, and proactively manage technical debt with a focus on front-end performance and usability.',
      responsibilities: [
        'Write test-driven, clean code and communicate standards/best practices to the team.',
        'Help shape architecture and deliver large-scale services, complex libraries, or major front-end infrastructure.',
        'Create future-proof, modular layouts and reusable components; participate in the Architectural Review Board.',
        'Build responsive, high-performance, accessible user-facing features; translate wireframes into high-quality software.',
        'Propose strategies for large-scale technical challenges; identify and tackle technical debt.',
        'Lead code reviews, documentation, and technical mentorship; collaborate across back-end, design, and product.',
      ],
      requiredQualifications: [
        'BS in Computer Science or equivalent experience.',
        '7+ years of front-end commercial software development.',
        'Expertise in JavaScript, React/Redux, and CSS; experience with AWS and cloud-based deployment.',
        'Strong UX/UI experience; proven ability to deliver large multi-team systems on time at high quality.',
        'Skilled debugging complex front-end issues and optimizing for cross-browser compatibility.',
        'Experience with GitHub or similar version control.',
      ],
      preferredQualifications: ['Relevant front-end or cloud certifications.'],
      eppValues: ['High Standards', 'Creative', 'Collaborative'],
      status: 'draft',
    },
  },
  {
    key: 'staff-software-engineer',
    sourceFile: 'Staff Software Engineer_JD_202306.docx',
    requisition: {
      department: 'Engineering', hiringManager: 'Priya Nair', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'High',
      remoteEligible: true, status: 'draft',
    },
    jobDescription: {
      title: 'Staff Software Engineer',
      summary:
        'Help shape broader architecture and own major pieces of infrastructure. Work closely with stakeholders to provide technical guidance, propose strategies, and set technical strategy at the product level while proactively managing technical debt across systems.',
      responsibilities: [
        'Write test-driven, clean code and communicate standards/best practices to the team.',
        'Help shape architecture and deliver large-scale services, complex libraries, or major infrastructure.',
        'Provide technical guidance and weigh in on decisions that impact technical direction; join the Architectural Review Board.',
        'Propose strategies for large-scale technical challenges and adopt new technologies.',
        'Identify and tackle technical debt; improve stability, performance, and scalability of business-critical systems.',
        'Lead code reviews, documentation, and technical mentorship.',
      ],
      requiredQualifications: [
        'BS in Computer Science or equivalent experience.',
        '7+ years of commercial software development.',
        'Able to anticipate product-level issues and make architectural decisions to avoid them.',
        'Proven ability to deliver large multi-team systems on time at high quality.',
        'SME on large sections of a codebase with deep understanding of a major part of the business architecture.',
        'Experienced debugging complex issues; experience with GitHub or similar.',
      ],
      preferredQualifications: ['Relevant cloud certifications.'],
      eppValues: ['High Standards', 'Accountable', 'Collaborative'],
      status: 'draft',
    },
  },
  {
    key: 'systems-administrator',
    sourceFile: 'Systems Administrator_JD_202203.docx',
    requisition: {
      department: 'Operations', hiringManager: 'Wes Anderson', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'Medium',
      remoteEligible: false, reasonForHire: 'IT systems administration',
      status: 'draft',
    },
    jobDescription: {
      title: 'Systems Administrator',
      summary:
        'Within IT, administer, maintain, and support operational systems — physical/virtual servers, wired/wireless network infrastructure, email and security systems, and domain/directory structures — ensuring stable day-to-day operation of the organization.',
      responsibilities: [
        'Administer and maintain internal network and computing systems and domain/directory facilities.',
        'Provide system/software updates; perform security monitoring and auditing of logs and services.',
        'Develop and maintain documentation, diagrams, and workflows; provide end-user support and training.',
        'Install and maintain physical and virtual systems; manage backups and disaster-recovery facilities.',
        'Review and maintain service-desk tickets; manage operational dashboards for uptime and SLAs.',
        'Perform issue resolution and root-cause analysis; enforce administrative access and security policies.',
        'Respond to on-call outages per rotation and assist day-to-day IT operations.',
      ],
      requiredQualifications: [
        "Bachelor's or technical degree in an IT-related field, or equivalent experience, with 2–4 years of experience.",
        'Active knowledge of Active Directory, Office 365, Azure, AWS, Windows Server, macOS, Unix/Linux, shell scripting, SQL, PowerShell, and VMware.',
        'Experience with firewalls, routers, switches, wireless access points; directory/domain systems (DNS, DHCP, NPS, RADIUS, ADFS, PKI).',
        'Ability to document and train on complex systems for non-technical audiences.',
        'Strong analytical and problem-solving skills with excellent written and oral communication.',
      ],
      preferredQualifications: [
        'Cisco switching/IOS, Veeam backups, Fortinet firewalls and FortiClient VPNs.',
        'Understanding of ITIL Foundation concepts.',
        'Available for flexible hours and on-call support, including weekends/holidays.',
      ],
      eppValues: ['Accountable', 'Focused', 'Resilient'],
      status: 'draft',
    },
  },
  {
    key: 'technical-product-manager',
    sourceFile: 'Technical Product Manager_JD_20201008.docx',
    requisition: {
      department: 'Product', hiringManager: 'Sofia Reyes', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'Medium',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'Technical Product Manager',
      summary:
        'Drive products and features from green light to launch. Use deep product experience and strong technical understanding of networking and OS intricacies to work with stakeholders to "build the thing right" through design, development, and launch.',
      responsibilities: [
        'Act as a scrum product owner; keep bugs to a minimum and manage bug fixes effectively.',
        'Communicate work in progress to all internal stakeholders to ensure alignment and prioritization.',
        'Maintain a well-prioritized backlog supported by user storyboards and acceptance criteria.',
        'Run user story mapping and design-thinking sessions.',
        'Serve as a subject-matter expert in web filtering.',
        'Balance long-term vision with immediate goals in an agile workflow.',
      ],
      requiredQualifications: [
        '5+ years in a product team role at a SaaS or networking/web-filtering company.',
        'Scrum Certified Product Owner.',
        'BA/BS.',
        'Technically savvy with the ability to understand sophisticated networking concepts.',
        'Outstanding organizational and analytical skills; articulate communicator.',
      ],
      preferredQualifications: [
        'Education-industry background.',
        'B2B product experience.',
      ],
      eppValues: ['Focused', 'Collaborative', 'Humble'],
      status: 'draft',
    },
  },
  {
    key: 'senior-product-manager',
    sourceFile: 'SR PM JD Updated.docx',
    requisition: {
      department: 'Product', hiringManager: 'Sofia Reyes', openings: 1,
      employmentType: FT, location: 'Austin, TX', priority: 'High',
      remoteEligible: false, reasonForHire: 'Safety products roadmap',
      status: 'draft',
    },
    jobDescription: {
      title: 'Senior Product Manager',
      summary:
        "Drive product initiatives from inception through execution for Lightspeed's Safety products, which monitor student well-being and alert school staff to concerning behavior. Define product strategy and roadmaps and work with development to iteratively build and launch.",
      responsibilities: [
        'Manage the entire product lifecycle; bring new products to market while balancing existing ones.',
        'Set the strategy, vision, and roadmap for your products using lean and agile methodologies.',
        'Collaborate cross-functionally (engineering, design, data, marketing, sales) to define requirements and deliver impact.',
        'Communicate product vision and progress to all stakeholders, ensuring alignment at every level.',
        'Understand market trends, competition, and customer feedback to inform roadmap decisions.',
        'Take full ownership of results and champion AI-forward thinking, integrating AI/ML capabilities.',
      ],
      requiredQualifications: [
        '5+ years as a Product Manager/leader in a product capacity.',
        'BA/BS.',
        'Deep understanding of markets, competition, and user requirements.',
        'Technically fluent — converse with engineers on APIs, integrations, on-device agents, and networking.',
        'Curious, analytical, and data-informed; able to present complex information to non-technical audiences.',
        'AI-forward: actively uses AI tools and understands where AI creates leverage.',
      ],
      preferredQualifications: [
        'SaaS and education experience.',
        'Experience at a company in its growth phase; B2B product experience.',
        'Background as a developer.',
        'Background in counseling, psychology, mental health, or a safety-related field.',
      ],
      eppValues: ['Driven', 'Accountable', 'Collaborative'],
      status: 'draft',
    },
  },
  {
    key: 'vp-engineering',
    sourceFile: 'VP Engineering.docx',
    requisition: {
      department: 'Engineering', hiringManager: 'Priya Nair', openings: 1,
      employmentType: FT, location: 'Austin, TX or Portland, OR', priority: 'High',
      remoteEligible: false, status: 'draft',
    },
    jobDescription: {
      title: 'VP, Engineering',
      summary:
        "Be the voice of engineering in key strategic decisions. Own the health of the engineering organization — managing all engineers, fostering growth and an innovative technical culture, and scaling the team and processes for sustainable growth of a high-growth, cloud-based platform.",
      responsibilities: [
        'Build, lead, and manage the engineering team; build processes to scale product, platform, and team.',
        'Drive the vision, design, strategy, and implementation of technology, platform, and product development.',
        'Develop and manage the technical roadmap with Product while ensuring deadlines are met with minimal error.',
        'Evaluate current architecture and oversee implementation of new technologies.',
        'Collaborate across product, design, business operations, marketing, customer success, and finance.',
        'Champion automation, reliability, availability, and observability as core tenets; help shape strategic direction.',
      ],
      requiredQualifications: [
        '7+ years of professional software development experience.',
        'Strong understanding of system design; able to articulate the design and architecture of an entire system.',
        'Excellent verbal and written communication; proactive self-starter and design thinker.',
        'Very experienced with Agile methodology.',
        'Flexible, coaching-oriented management style that can also engage directly when urgency is needed.',
      ],
      preferredQualifications: [
        'Passion for education and EdTech experience.',
        'Experience with cloud partners including AWS.',
      ],
      eppValues: ['Driven', 'Accountable', 'Collaborative'],
      status: 'draft',
    },
  },
];

export default ataSeedRoles;
