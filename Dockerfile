FROM ubuntu:16.04

RUN apt-get update
RUN apt-get install -y python
RUN apt-get install -y libgmp10
RUN apt-get install -y python-pip git gcc autoconf automake libcap-dev
RUN apt-get install -y pkg-config libssl-dev

WORKDIR /root

RUN apt-get install -y vim ledger
RUN pip install --upgrade pip

RUN pip install web.py boto3 pynacl python-jose ofxhome lxml
RUN git clone https://github.com/captin411/ofxclient.git
RUN cd ofxclient && python setup.py install
ADD . /root/ledgereditor/
WORKDIR /root/ledgereditor
EXPOSE 8888
ENTRYPOINT /usr/bin/python serve_ledger.py
