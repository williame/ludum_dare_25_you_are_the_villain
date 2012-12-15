#!/usr/bin/env python

import os, subprocess, base64, tempfile, shutil, sys
import tornado.ioloop
import tornado.web
from tornado.options import define, options, parse_command_line

define("port",default=8888,type=int)
define("branch",default="master")
define("enable_upload",default=None,multiple=True,type=str)
define("access",type=str,multiple=True)

class BaseHandler(tornado.web.RequestHandler):
    def check_auth(self,access=None):
        if access is None: access = options.access
        if not access: return
        # check authenticated
        auth_header = self.request.headers.get("Authorization") or ""
        if not auth_header.startswith("Basic "):
            raise tornado.web.HTTPError(401)
        user = base64.decodestring(auth_header[6:])
        if user not in access:
            raise tornado.web.HTTPError(401)
        return user[:user.find(":")]
    def check_path(self,path):
        # check not escaping chroot
        if os.path.commonprefix([os.path.abspath(path),home]) != home:
            raise tornado.web.HTTPError(403)
    def write_error(self,status_code,**kwargs):
        if status_code == 401:
            self.set_header("WWW-Authenticate","Basic realm=Restricted")
        tornado.web.RequestHandler.write_error(self,status_code,**kwargs)

class MainHandler(BaseHandler):
    def get(self,path):
        self.check_auth()
        self.check_path(path)
        # get the file to serve
        body = None
        if not bare:
        	try:
        		with open(path,"r") as f:
        			body = f.read()
		except IOError as e:
			print e
        if not body:
            try:
                body = subprocess.check_output(["git","show","%s:%s"%(options.branch,path)])
            except subprocess.CalledProcessError:
                raise tornado.web.HTTPError(404)
        # and set its content-type
        if path.endswith(".js"):
            content_type = "text/javascript"
        else:
            content_type = subprocess.Popen(["file","-i","-b","-"],stdout=subprocess.PIPE,
                stdin=subprocess.PIPE, stderr=subprocess.STDOUT).communicate(input=body)[0].split(";")[0]
        self.set_header("Content-Type",content_type)
        # serve it
        self.write(body)
        
class ZipBallHandler(BaseHandler):
    def get(self):
        self.check_auth()
        body = subprocess.check_output(["git","archive","--format","zip",options.branch])
        self.set_header("Content-Type","application/zip")
        self.write(body)
        
class UploadHandler(BaseHandler):
    def post(self):
        if not options.enable_upload:
            raise tornado.web.HTTPError(403,"uploads not allowed")
        user = self.check_auth(options.enable_upload)
        # get the uploaded file
        message = self.get_argument("message")
        folder = self.get_argument("folder")
        if folder.startswith("/"):
            folder = folder[1:]
        folder = os.path.normpath(folder)
        files = self.request.files["files"]
        filenames = [os.path.join(folder,upload["filename"]) for upload in files]
        for filename in filenames:
            self.check_path(filename)
        bodies = [upload["body"] for upload in files]
        # check out the repo to a temporary folder
        working_dir = tempfile.mkdtemp() if bare else home
        print "user",user,"uploading",",".join(filenames),"(%d bytes)"%sum(len(body) for body in bodies),"using",working_dir,"..."
        try:
            if bare:
                os.chdir(working_dir)
                subprocess.check_call(["git","clone",home,working_dir])
                subprocess.check_call(["git","checkout",options.branch])
            dirty = False
            for filename,body in zip(filenames,bodies):
                with open(filename,"w") as f:
                    f.write(body)
                subprocess.check_call(["git","add",filename,"-v"])
                dirty = dirty or subprocess.call(["git","diff","--quiet",options.branch,filename])
            if dirty:
                subprocess.check_call(["git","commit","-m",message,"--author=%s <none@none>"%user])
                if bare:
                    subprocess.check_call(["git","push","origin",options.branch])
            else:
                print "(change to",",".join(filenames)," was no-op)"
        finally:
            if bare:
                print "cleaning up",working_dir,"..."
                os.chdir(home)
                shutil.rmtree(working_dir)
        
if __name__ == "__main__":
    home = os.getcwd()
    bare = not os.path.isdir(".git")
    parse_command_line()
    zipballFilename = r"/%s.zip"%(os.path.splitext(os.path.split(home)[1])[0])
    application = tornado.web.Application((
        (r"/upload",UploadHandler),
        (zipballFilename,ZipBallHandler),
        (r"/(.*)",MainHandler),
    ))
    print "serving",options.branch,"on port",options.port,"(zipball is %s)"%zipballFilename
    application.listen(options.port)
    try:
        tornado.ioloop.IOLoop.instance().start()
    except KeyboardInterrupt:
        print "bye!"
