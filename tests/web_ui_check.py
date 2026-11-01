from playwright.sync_api import sync_playwright, expect
import json

BASE='http://127.0.0.1:5080/'
TOKEN='upload-smoke-token'
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height,name in [(1440,1000,'desktop'),(390,844,'mobile'),(320,568,'compact')]:
        page=browser.new_page(viewport={'width':width,'height':height},locale='zh-CN')
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(BASE,wait_until='networkidle')
        expect(page.locator('#accessDialog')).to_be_visible()
        assert page.locator('.topbar input').count()==0
        assert page.locator('.topbar #connectBtn').count()==0
        page.locator('#apiToken').fill('invalid-test-key')
        page.locator('#accessSubmit').click()
        expect(page.locator('#accessError')).to_be_visible()
        page.locator('#apiToken').fill(TOKEN)
        page.locator('#accessSubmit').click()
        expect(page.locator('#accessDialog')).not_to_be_visible()
        expect(page.locator('#grid tbody tr')).to_have_count(1)
        assert page.evaluate("() => localStorage.getItem('rollerSealAccessKey.v1')") == TOKEN
        page.reload(wait_until='networkidle')
        expect(page.locator('#grid tbody tr')).to_have_count(1)
        expect(page.locator('#accessDialog')).not_to_be_visible()
        page.evaluate('() => document.fonts.ready')
        assert page.locator('.brand').inner_text()=='标准辊密封生成'
        # Themes follow the system, with the requested seven dark-mode colors.
        for scheme in ['light', 'dark']:
            page.emulate_media(color_scheme=scheme)
            expected = {
                'light': ['rgb(243, 243, 243)', 'rgb(255, 255, 255)', 'rgb(37, 99, 235)', 'rgb(51, 51, 51)', 'rgb(212, 212, 212)'],
                'dark': ['rgb(17, 19, 24)', 'rgb(26, 29, 35)', 'rgb(37, 99, 235)', 'rgb(229, 231, 235)', 'rgb(52, 57, 64)']
            }[scheme]
            for selector, prop, value in [
                ('body', 'backgroundColor', expected[0]),
                ('.settings', 'backgroundColor', expected[1]),
                ('#dxfBtn', 'backgroundColor', expected[2]),
                ('body', 'color', expected[3]),
                ('.settings', 'borderTopColor', expected[4]),
                ('.settings', 'borderRadius', '2px')
            ]:
                assert page.locator(selector).evaluate('(el,prop)=>getComputedStyle(el)[prop]', prop)==value
            assert page.locator('#dxfBtn').evaluate('(el)=>getComputedStyle(el).color')=='rgb(255, 255, 255)'
            assert page.locator('.table-wrap').evaluate('(el)=>getComputedStyle(el).backgroundColor')==expected[0]
            assert page.locator('#grid th').first.evaluate('(el)=>getComputedStyle(el).backgroundColor')==expected[1]
            assert page.locator('#exportStep').evaluate('(el)=>getComputedStyle(el).appearance')=='none'
            checked_color = 'rgb(59, 130, 246)' if scheme=='dark' else 'rgb(37, 99, 235)'
            assert page.locator('#exportStep').evaluate('(el)=>getComputedStyle(el).backgroundColor')==checked_color
            if scheme=='dark':
                assert page.locator('#grid tbody td').nth(2).evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(36, 40, 48)'
                assert page.locator('#rowCount').evaluate('(el)=>getComputedStyle(el).color')=='rgb(156, 163, 175)'
            page.screenshot(path=f'../../work/ui-theme-{scheme}-{name}.png',full_page=True)
        assert page.locator('.export-actions span').count()==0
        assert page.locator('#hiddenLineScale,#viewGap,#combineStep,#stepName,.editor-card,.task-step-details').count()==0
        assert page.locator('#grid th').count()==15
        assert page.locator('#grid input[data-column="14"]').count()==0
        assert page.locator('.project-checks input').count()==4
        assert page.locator('#showProgressBtn').evaluate('(el)=>el.parentElement.classList.contains("topbar")')
        assert page.locator('#showProgressBtn').evaluate('(el)=>getComputedStyle(el).position')=='static'
        colors=[page.locator(s).evaluate('(el)=>getComputedStyle(el).backgroundColor') for s in ['#dxfBtn','#pdfBtn','#stepBtn']]
        assert len(set(colors))==1
        assert colors[0]!=page.locator('#validateBtn').evaluate('(el)=>getComputedStyle(el).backgroundColor')
        assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
        panel=page.locator('.table-panel').bounding_box()
        assert panel['y']+panel['height']<=height
        if width<=800:
            assert page.locator('.table-wrap').bounding_box()['height']<=221
            assert page.locator('.table-footer').is_hidden()
            action=page.locator('#grid tbody td').first.bounding_box()['width']
            assert 45<=action<=49
            number=page.locator('#grid input[data-column="1"]')
            assert number.evaluate('(el)=>getComputedStyle(el).fontSize')=='16px'
            assert number.bounding_box()['width']<=58
            assert page.locator('#grid').evaluate('(el)=>getComputedStyle(el).touchAction')=='manipulation'
        # Parameter validation is independent of task progress.
        page.locator('#validateBtn').click()
        expect(page.locator('#validationDialog')).to_be_visible()
        assert page.locator('#validationTitle').inner_text()=='没有错误'
        expect(page.locator('#progressDialog')).not_to_be_visible()
        expect(page.locator('#validationDialog')).not_to_be_visible(timeout=4000)
        number=page.locator('#grid input[data-column="1"]')
        number.fill('0')
        page.locator('#validateBtn').click()
        expect(page.locator('#validationDialog')).to_be_visible()
        assert page.locator('#validationTitle').inner_text()=='检查未通过'
        page.wait_for_timeout(1800)
        assert page.locator('#validationDialog').is_visible()
        page.locator('#validationDialog button').click()
        number.fill('5')
        # Imported optional dimensions stay in the submitted data, but are not inputs.
        page.evaluate("() => {state.rows[0][14]='19';state.rows[0][15]='10';}")
        requests=[]
        snapshot={}
        def capture(route):
            requests.append(route.request.post_data_json)
            route.fulfill(content_type='application/json',body='{"id":"ui-check"}')
        page.route('**/api/jobs',capture)
        page.route('**/api/jobs/ui-check',lambda route:route.fulfill(content_type='application/json',body=json.dumps(snapshot)))
        for checkbox in page.locator('.project-checks input').all():checkbox.check()
        for selector,kind in [('#dxfBtn','dxf'),('#pdfBtn','pdf'),('#stepBtn','project')]:
            snapshot.clear()
            snapshot.update(status='running',message='正在渲染 1 页 A4 PDF…',completed=1,downloadable=False,logs=['正在生成 1/1：1','正在从当前模型提取三视图 1：1','已导出 1：SolidCraft + STEP','正在将 1 张加工图排版到一个 DXF…','正在渲染 1 页 A4 PDF…'])
            page.locator(selector).click()
            expect(page.locator('#progressDialog')).to_be_visible()
            expect(page.locator('#jobMessage')).to_contain_text('正在渲染')
            assert page.locator('#jobProgress').evaluate('(el)=>el.value<el.max')
            assert page.locator('.task-status-line').is_hidden()
            assert page.locator('#progressDialog').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(26, 29, 35)'
            assert page.locator('#progressDialog').evaluate('(el)=>getComputedStyle(el).borderRadius')=='3px'
            if kind=='dxf':
                page.screenshot(path=f'../../work/ui-task-{name}.png',full_page=True)
            assert page.locator('#showProgressBtn').is_hidden()
            assert not page.locator('.log-details').evaluate('(el)=>el.open')
            body=requests[-1]
            assert body['outputFormat']==kind and body['combineStep'] is False
            assert body['hiddenLineScale']==2 and body['viewGap']==60
            assert body['rows'][0][14:16]==['19','10']
            for key in ['exportDxf','exportStep','exportPdf','exportCsv']:assert body[key]==(kind=='project')
            page.get_by_role('button',name='关闭任务进度弹窗').click()
            page.locator('#showProgressBtn').click()
            expect(page.locator('#progressDialog')).to_be_visible()
            snapshot.update(status='completed',message='生成完成',downloadable=True,contentType='application/zip',downloadName='result.zip')
            expect(page.locator('#downloadBtn')).to_be_visible()
            assert page.locator('#jobProgress').evaluate('(el)=>el.value===el.max')
            box=page.locator('#progressDialog').bounding_box()
            assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width and box['y']+box['height']<=height
            page.get_by_role('button',name='关闭任务进度弹窗').click()
        # Expired access during download opens the key dialog directly.
        page.route('**/api/jobs/ui-check/download',lambda route:route.fulfill(status=401,content_type='application/json',body='{"error":"Unauthorized"}'))
        page.locator('#showProgressBtn').click()
        page.locator('#downloadBtn').click()
        expect(page.locator('#accessDialog')).to_be_visible()
        assert page.evaluate("() => localStorage.getItem('rollerSealAccessKey.v1')") is None
        page.locator('#apiToken').fill(TOKEN)
        page.locator('#accessSubmit').click()
        expect(page.locator('#accessDialog')).not_to_be_visible()
        page.get_by_role('button',name='关闭任务进度弹窗').click()
        page.locator('#addBtn').click()
        expect(page.locator('#grid tbody tr')).to_have_count(2)
        page.locator('#grid .delete').first.click()
        expect(page.locator('#grid tbody tr')).to_have_count(1)
        page.screenshot(path=f'../../work/ui-{name}.png',full_page=True)
        assert not errors,errors
        page.close()
    browser.close()
print('PASS: key dialog/persistence, compact inputs, header, output actions, validation feedback, task stages and viewport limits.')
