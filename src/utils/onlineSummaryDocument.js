function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildOnlineSummaryPreviewHtml(detail) {
  const workRows = Array.from({ length: 3 }, (_, index) => detail?.work_experiences?.[index] || {});
  const educationRows = Array.from({ length: 3 }, (_, index) => detail?.education_backgrounds?.[index] || {});

  const workHtml = workRows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item?.dates_of_employment)}</td>
          <td>${escapeHtml(item?.organization)}</td>
          <td>${escapeHtml(item?.position_title)}</td>
        </tr>
      `
    )
    .join("");

  const educationHtml = educationRows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item?.dates_of_attendance)}</td>
          <td>${escapeHtml(item?.institution)}</td>
          <td>${escapeHtml(item?.field_of_study)}</td>
          <td>${escapeHtml(item?.degree_obtained)}</td>
        </tr>
      `
    )
    .join("");

  const block = (titleEn, titleZh, value) => `
    <h2>${escapeHtml(titleEn)}<br>${escapeHtml(titleZh)}</h2>
    <p>${escapeHtml(value).replace(/\n/g, "<br>")}</p>
  `;

  return `
    <h1 style="text-align:center;">Candidate Summary Sheet<br>候选人简表</h1>
    <table>
      <tbody>
        <tr><th colspan="4">Basic Information<br>基本信息</th></tr>
        <tr>
          <td>Name<br>姓名</td>
          <td>${escapeHtml(detail?.name)}</td>
          <td>Date of Birth<br>出生日期<br>（格式: 日/月/年）</td>
          <td>${escapeHtml(detail?.date_of_birth)}</td>
        </tr>
        <tr>
          <td>Gender<br>性别</td>
          <td>${escapeHtml(detail?.gender)}</td>
          <td>Nationality<br>国籍</td>
          <td>${escapeHtml(detail?.nationality)}</td>
        </tr>
        <tr>
          <td>Organization Name<br>公司名称</td>
          <td colspan="2">${escapeHtml(detail?.organization_name)}</td>
          <td>Position<br>职务<br><br>${escapeHtml(detail?.position)}</td>
        </tr>
        <tr><th colspan="4">Company Profile<br>企业概况</th></tr>
        <tr>
          <td>Assets<br>总资产</td>
          <td>${escapeHtml(detail?.assets)}</td>
          <td>Employees<br>员工人数</td>
          <td>${escapeHtml(detail?.employees)}</td>
        </tr>
        <tr>
          <td>Revenue<br>企业营收</td>
          <td>${escapeHtml(detail?.revenue)}</td>
          <td>Industry<br>公司行业</td>
          <td>${escapeHtml(detail?.industry)}</td>
        </tr>
      </tbody>
    </table>
    <h3>Work Experience<br>工作经历</h3>
    <table>
      <tbody>
        <tr>
          <th>起止日期（年/月）<br>Dates of Employment</th>
          <th>工作单位<br>Organization</th>
          <th>担任职务<br>Position/Title</th>
        </tr>
        ${workHtml}
      </tbody>
    </table>
    <h3>Educational Background<br>教育经历</h3>
    <table>
      <tbody>
        <tr>
          <th>起止日期<br>Dates of Attendance</th>
          <th>毕业院校<br>Institution</th>
          <th>学习专业<br>Field of Study</th>
          <th>学历/学位<br>Degree Obtained</th>
        </tr>
        ${educationHtml}
      </tbody>
    </table>
    ${block("Introduction", "企业简介", detail?.introduction)}
    ${block("Professional Experience", "个人职业经历", detail?.professional_experience)}
    ${block("Why do you want to join this program, and what do you hope to gain from it?", "您为什么希望来参加伦比亚大学商学院全球价值投资家项目? 您希望通过课程获得什么？", detail?.program_motivation)}
    ${block("Note", "备注", detail?.note)}
  `;
}

function buildOnlineSummaryWordHtml(detail) {
  const body = buildOnlineSummaryPreviewHtml(detail);
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="OpenAI Codex">
  <meta name="Originator" content="OpenAI Codex">
  <title>Candidate Summary Sheet</title>
  <style>
    body {
      font-family: "Times New Roman", "SimSun", serif;
      color: #22365f;
      margin: 24px;
      line-height: 1.6;
    }
    h1, h2, h3 {
      color: #22365f;
      font-weight: 700;
      margin: 0 0 12px;
      text-align: center;
    }
    h1 {
      font-size: 20pt;
      margin-bottom: 18px;
    }
    h2 {
      margin-top: 20px;
      padding: 10px 12px;
      border: 1px solid #bfd0ec;
      background: #f3f8ff;
      font-size: 12pt;
    }
    h3 {
      margin-top: 18px;
      text-align: left;
      font-size: 12pt;
    }
    p {
      margin: 0 0 14px;
      white-space: normal;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 12px 0 18px;
      font-size: 11pt;
    }
    th, td {
      border: 1px solid #d8e1f0;
      padding: 10px 12px;
      vertical-align: top;
      text-align: left;
      word-break: break-word;
    }
    th {
      background: #eef5ff;
      font-weight: 700;
      text-align: center;
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function triggerBrowserDownload(blob, filename) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export function downloadOnlineSummaryAsWord(detail, filenameBase = "candidate-summary") {
  const safeBase = String(filenameBase || "candidate-summary").trim().replace(/[\\/:*?"<>|]+/g, "-");
  const html = buildOnlineSummaryWordHtml(detail);
  const blob = new Blob([`\ufeff${html}`], {
    type: "application/msword;charset=utf-8",
  });
  triggerBrowserDownload(blob, `${safeBase || "candidate-summary"}.doc`);
}
