package com.oracle.sbom;

import org.json.JSONObject;

public class SBOMTestApplication {
    public static void main(String argv[]) {
        JSONObject jo = new JSONObject();
        jo.put("lorem", "ipsum");
        jo.put("dolor", "sit amet");
        System.out.println(jo);
    }
}
